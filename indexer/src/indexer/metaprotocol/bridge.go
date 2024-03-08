package metaprotocol

import (
	"crypto/ed25519"
	"crypto/x509"
	b64 "encoding/base64"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"

	"github.com/donovansolms/cosmos-inscriptions/indexer/src/indexer/models"
	"github.com/donovansolms/cosmos-inscriptions/indexer/src/indexer/types"
	"github.com/kelseyhightower/envconfig"
	"github.com/leodido/go-urn"
	"gorm.io/gorm"
)

type BridgeConfig struct {
	BridgePrivateKey string `envconfig:"BRIDGE_PRIVATE_KEY" required:"true"`
	BridgePublicKey  string `envconfig:"BRIDGE_PUBLIC_KEY" required:"true"`
}

type Bridge struct {
	chainID string
	db      *gorm.DB
	privKey ed25519.PrivateKey
	pubKey  ed25519.PublicKey
}

func NewBridgeProcessor(chainID string, db *gorm.DB) *Bridge {
	// Parse config environment variables for self
	var config BridgeConfig
	err := envconfig.Process("", &config)
	if err != nil {
		log.Fatalf("Unable to process config: %s", err)
	}

	privKeyDer, err := b64.StdEncoding.DecodeString(config.BridgePrivateKey)
	if err != nil {
		log.Fatalf("Unable to parse private key: %s", err)
	}
	pubKeyDer, err := b64.StdEncoding.DecodeString(config.BridgePublicKey)
	if err != nil {
		log.Fatalf("Unable to parse public key: %s", err)
	}

	privKey, err := x509.ParsePKCS8PrivateKey(privKeyDer)
	if err != nil {
		log.Fatalf("Unable to parse public key: %s", err)
	}

	pubKey, err := x509.ParsePKIXPublicKey(pubKeyDer)
	if err != nil {
		log.Fatalf("Unable to parse public key: %s", err)
	}

	return &Bridge{
		chainID: chainID,
		db:      db,
		privKey: privKey.(ed25519.PrivateKey),
		pubKey:  pubKey.(ed25519.PublicKey),
	}
}

func (protocol *Bridge) Name() string {
	return "bridge"
}

func (protocol *Bridge) Process(transactionModel models.Transaction, protocolURN *urn.URN, rawTransaction types.RawTransaction) error {
	sender, err := rawTransaction.GetSenderAddress()
	if err != nil {
		return err
	}

	parsedURN, err := ParseProtocolString(protocolURN)
	if err != nil {
		return err
	}

	if parsedURN.ChainID != protocol.chainID {
		return fmt.Errorf("chain ID in protocol string does not match transaction chain ID")
	}
	switch parsedURN.Operation {
	case "send":
		ticker := strings.TrimSpace(parsedURN.KeyValuePairs["tic"])
		ticker = strings.ToUpper(ticker)

		// Check if the ticker exists
		var tokenModel models.Token
		result := protocol.db.Where("chain_id = ? AND ticker = ?", parsedURN.ChainID, ticker).First(&tokenModel)
		if result.Error != nil {
			return fmt.Errorf("token with ticker '%s' doesn't exist", ticker)
		}

		// Check if we know about the remote chain
		remoteChainId := strings.TrimSpace(parsedURN.KeyValuePairs["rch"])
		var remoteChainModel models.BridgeRemoteChain
		result = protocol.db.Where("chain_id = ? AND remote_chain_id = ?", parsedURN.ChainID, remoteChainId).First(&remoteChainModel)
		if result.Error != nil {
			return fmt.Errorf("remote chain '%s' doesn't exist", remoteChainId)
		}

		// Check that the remote contract matches what we expect
		// TODO: Do we actually need the remote contract address in the memo and signature or can we just get it from the DB?
		remoteContract := strings.TrimSpace(parsedURN.KeyValuePairs["rco"])
		if remoteChainModel.RemoteContract != remoteContract {
			return fmt.Errorf("incorrect remote contract for chain '%s'", remoteChainId)
		}

		// Check if this token has been enabled for bridging
		var bridgeTokenModel models.BridgeToken
		result = protocol.db.Where("remote_chain_id = ? AND token_id = ?", remoteChainModel.ID, tokenModel.ID).First(&bridgeTokenModel)
		if result.Error != nil || !bridgeTokenModel.Enabled {
			return fmt.Errorf("token %s not enabled for bridging to %s", ticker, remoteChainId)
		}

		receiverAddress := strings.TrimSpace(parsedURN.KeyValuePairs["dst"])
		// TODO: Check if receiver address is valid

		amountString := strings.TrimSpace(parsedURN.KeyValuePairs["amt"])
		// Convert amount to have the correct number of decimals
		amount, err := strconv.ParseFloat(amountString, 64)
		if err != nil {
			return fmt.Errorf("unable to parse amount '%s'", err)
		}
		if amount <= 0 {
			return fmt.Errorf("amount must be greater than 0")
		}

		// TODO: factor this transfer logic out into the CFT20 metaprotocol
		// Check that the user has enough tokens to send
		var holderModel models.TokenHolder
		result = protocol.db.Where("chain_id = ? AND token_id = ? AND address = ?", parsedURN.ChainID, tokenModel.ID, sender).First(&holderModel)
		if result.Error != nil {
			return fmt.Errorf("sender does not have any tokens to sell")
		}

		if holderModel.Amount < uint64(amount) {
			return fmt.Errorf("sender does not have enough tokens to sell")
		}

		// At this point we know that the sender has enough tokens to send
		// so update the sender's balance
		holderModel.Amount = holderModel.Amount - uint64(amount)
		result = protocol.db.Save(&holderModel)
		if result.Error != nil {
			return fmt.Errorf("unable to update seller's balance '%s'", err)
		}

		// Record the transfer
		historyModel := models.TokenAddressHistory{
			ChainID:       parsedURN.ChainID,
			Height:        transactionModel.Height,
			TransactionID: transactionModel.ID,
			TokenID:       tokenModel.ID,
			Sender:        sender,
			Receiver:      "bridge",
			Action:        "bridge",
			Amount:        uint64(math.Round(amount)),
			DateCreated:   transactionModel.DateCreated,
		}
		result = protocol.db.Save(&historyModel)
		if result.Error != nil {
			return result.Error
		}

		// Note: A signature is spendable! Create and store it last.
		attestation := []byte(parsedURN.ChainID + transactionModel.Hash + tokenModel.Ticker + amountString + remoteChainId + remoteContract + receiverAddress)
		signature := b64.StdEncoding.EncodeToString(ed25519.Sign(protocol.privKey, attestation))

		// Record the bridge operation
		bridgeHistory := models.BridgeHistory{
			ChainID:        parsedURN.ChainID,
			Height:         transactionModel.Height,
			TransactionID:  transactionModel.ID,
			TokenID:        tokenModel.ID,
			Sender:         sender,
			Action:         "send",
			Amount:         uint64(math.Round(amount)),
			RemoteChainID:  remoteChainId,
			RemoteContract: remoteContract,
			Receiver:       receiverAddress,
			Signature:      signature,
			DateCreated:    transactionModel.DateCreated,
		}
		result = protocol.db.Save(&bridgeHistory)
		if result.Error != nil {
			return result.Error
		}
	}
	return nil
}
