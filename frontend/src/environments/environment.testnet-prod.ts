export const environment = {
  production: true,
  domain: 'testnet.asteroidprotocol.io',
  limits: {
    maxFileSize: 770000,
  },
  storage: {
    connectedWalletKey: "connectedWallet"
  },
  fees: {
    protocol: {
      inscription: {
        inscribe: {
          receiver: "",
          denom: "uatom",
          amount: "0"
        },
        transfer: {
          receiver: "",
          denom: "uatom",
          amount: "0"
        },
      },
      cft20: {
        deploy: {
          receiver: "",
          denom: "uatom",
          amount: "0"
        },
        mint: {
          receiver: "",
          denom: "uatom",
          amount: "0"
        },
        transfer: {
          receiver: "",
          denom: "uatom",
          amount: "0"
        },
        list: {
          receiver: "",
          denom: "uatom",
          amount: "0",
          minTradeSize: 0.000001,
        },
        buy: {
          receiver: "cosmos1y6338yfh4syssaglcgh3ved9fxhfn0jk4v8qtv",
          denom: "uatom",
          amount: "0.02", // Default 2%
          type: "dynamic-percent"
        },
        delist: {
          receiver: "",
          denom: "uatom",
          amount: "0"
        },
      },
    },
    chain: {
      gasLimit: "12000000"
    }
  },
  api: {
    endpoint: 'https://testnet-api.asteroidprotocol.io/v1/graphql',
    wss: 'wss://testnet-api.asteroidprotocol.io/v1/graphql',
    explorer: 'https://testnet-api.asteroidprotocol.io/chain/gaia/lcd/cosmos/tx/v1beta1/txs/',
  },
  chain: {
    chainId: "theta-testnet-001",
    chainName: "Cosmos Hub Testnet",
    rpc: "https://rpc.sentry-01.theta-testnet.polypore.xyz",
    rest: "https://rest.sentry-01.theta-testnet.polypore.xyz",
    bip44: {
      coinType: 118
    },
    bech32Config: {
      bech32PrefixAccAddr: 'cosmos',
      bech32PrefixAccPub: 'cosmospub',
      bech32PrefixValAddr: 'cosmosval',
      bech32PrefixValPub: 'cosmosvalpub',
      bech32PrefixConsAddr: 'cosmosvalcons',
      bech32PrefixConsPub: 'cosmosvalconsconspub'
    },
    currencies: [{
      coinDenom: 'atom',
      coinMinimalDenom: 'uatom',
      coinDecimals: 6
    }],
    feeCurrencies: [{
      coinDenom: 'atom',
      coinMinimalDenom: 'uatom',
      coinDecimals: 6,
      gasPriceStep: { low: 0.005, average: 0.005, high: 0.008 }
    }],
    stakeCurrency: {
      coinDenom: 'atom',
      coinMinimalDenom: 'uatom',
      coinDecimals: 6
    },
  },
};
