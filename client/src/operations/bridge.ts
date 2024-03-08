import BridgeProtocol from '../metaprotocol/bridge.js'
import { OperationsBase, Options, getDefaultOptions } from './index.js'

export class BridgeOperations<
  T extends boolean = false,
> extends OperationsBase<T> {
  protocol: BridgeProtocol
  address: string
  options: Options<T>

  constructor(
    chainId: string,
    address: string,
    options: Options<T> = getDefaultOptions(),
  ) {
    super()
    this.protocol = new BridgeProtocol(chainId)
    this.address = address
    this.options = options
  }

  send(
    ticker: string,
    amount: number,
    remoteChain: string,
    remoteContract: string,
    receiver: string,
  ) {
    return this.prepareOperation(
      this.protocol.send(ticker, amount, remoteChain, remoteContract, receiver),
    )
  }
}
