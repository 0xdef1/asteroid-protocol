import {
    BaseProtocol,
    MetaProtocolParams,
    ProtocolFee,
    buildOperation,
} from './index.js'
  
  const DEFAULT_FEE: ProtocolFee = {
    ibcChannel: 'channel-569',
    receiver: 'cosmos1y6338yfh4syssaglcgh3ved9fxhfn0jk4v8qtv',
    denom: 'uatom',
    operations: {},
}
  
export default class BridgeProtocol extends BaseProtocol {
    version = 'v1'
    name = 'bridge'
  
    constructor(chainId: string, fee: ProtocolFee = DEFAULT_FEE) {
      super(chainId, fee)
    }
  
    send(
      ticker: string,
      amount: number,
      receiver: string,
      destination: string,
    ) {
      const params: MetaProtocolParams = [
        ['tic', ticker],
        ['amt', amount],
        ['to', receiver],
        ['dst', destination],
      ]
      return buildOperation(this, this.fee, this.chainId, 'send', params)
    }
}
  