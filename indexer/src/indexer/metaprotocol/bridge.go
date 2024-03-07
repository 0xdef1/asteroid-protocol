package metaprotocol

import (
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
	S3Endpoint string `envconfig:"S3_ENDPOINT" required:"true"`
	S3Region   string `envconfig:"S3_REGION" required:"true"`
	S3Bucket   string `envconfig:"S3_BUCKET"`
	S3ID       string `envconfig:"S3_ID" required:"true"`
	S3Secret   string `envconfig:"S3_SECRET" required:"true"`
	S3Token    string `envconfig:"S3_TOKEN"`
}

type Bridge struct {
	chainID    string
	db         *gorm.DB
	s3Endpoint string
	s3Region   string
	s3Bucket   string
	// s3ID is the S3 credentials ID
	s3ID string
	// s3Secret is the S3 credentials secret
	s3Secret string
	// s3Token is the S3 credentials token
	s3Token string
	// Define protocol rules
	// nameMinLength          int
	// nameMaxLength          int
	// tickerMinLength        int
	// tickerMaxLength        int
	// decimalsMaxValue       uint
	// maxSupplyMaxValue      uint64
	// perWalletLimitMaxValue uint64
}

func NewBridgeProcessor(chainID string, db *gorm.DB) *Bridge {
	// Parse config environment variables for self
	var config InscriptionConfig
	err := envconfig.Process("", &config)
	if err != nil {
		log.Fatalf("Unable to process config: %s", err)
	}

	return &Bridge{
		chainID:    chainID,
		db:         db,
		s3Endpoint: config.S3Endpoint,
		s3Region:   config.S3Region,
		s3Bucket:   config.S3Bucket,
		s3ID:       config.S3ID,
		s3Secret:   config.S3Secret,
		s3Token:    config.S3Token,
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

		bridgeContract := strings.TrimSpace(parsedURN.KeyValuePairs["dst"])
		// TODO: Check if bridge destination is valid
		// TODO: Check if bridge for this token initialized

		receiverAddress := strings.TrimSpace(parsedURN.KeyValuePairs["to"])
		// TODO: Check if receiver address is valid

		destinationAddress := "bridge"

		amountString := strings.TrimSpace(parsedURN.KeyValuePairs["amt"])
		// Convert amount to have the correct number of decimals
		amount, err := strconv.ParseFloat(amountString, 64)
		if err != nil {
			return fmt.Errorf("unable to parse amount '%s'", err)
		}
		if amount <= 0 {
			return fmt.Errorf("amount must be greater than 0")
		}

		// TODO: factor transfer out into CFT20 metaprotocol
		// Check that the user has enough tokens to send
		var holderModel models.TokenHolder
		result = protocol.db.Where("chain_id = ? AND token_id = ? AND address = ?", parsedURN.ChainID, tokenModel.ID, sender).First(&holderModel)
		if result.Error != nil {
			return fmt.Errorf("sender does not have any tokens to sell")
		}

		if holderModel.Amount < uint64(amount) {
			return fmt.Errorf("sender does not have enough tokens to sell")
		}

		// At this point we know that the sender has enough tokens to sell
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
			Receiver:      destinationAddress,
			Action:        "transfer",
			Amount:        uint64(math.Round(amount)),
			DateCreated:   transactionModel.DateCreated,
		}
		result = protocol.db.Save(&historyModel)
		if result.Error != nil {
			return result.Error
		}

		// TODO: create signature last, after other state is updated.
		// A signature is spendable!
		signature := "temporary signature placeholder"

		bridgeHistory := models.BridgeHistory{
			ChainID:        parsedURN.ChainID,
			Height:         transactionModel.Height,
			TransactionID:  transactionModel.ID,
			TokenID:        tokenModel.ID,
			Sender:         sender,
			Action:         "send",
			Amount:         uint64(math.Round(amount)),
			Receiver:       receiverAddress,
			BridgeContract: bridgeContract,
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
