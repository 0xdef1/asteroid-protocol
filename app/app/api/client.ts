import {
  AsteroidService,
  QueryOptions,
  ValueTypes,
  WSSubscription,
  order_by,
} from '@asteroid-protocol/sdk/client'
import { aggregateCountSelector } from '~/api/common'
import {
  Inscription,
  InscriptionHistory,
  InscriptionTradeHistory,
  InscriptionWithMarket,
  inscriptionHistorySelector,
  inscriptionListingSelector,
  inscriptionSelector,
  inscriptionTradeHistorySelector,
} from '~/api/inscription'
import { statusSelector } from '~/api/status'
import {
  MarketplaceTokenListing,
  Token,
  TokenAddressHistory,
  TokenHolder,
  TokenHolderAmount,
  TokenHolding,
  TokenMarket,
  TokenSupply,
  TokenTradeHistory,
  TokenType,
  tokenAddressHistorySelector,
  tokenDetailSelector,
  tokenHolderAmountSelector,
  tokenHolderSelector,
  tokenHoldingSelector,
  tokenListingSelector,
  tokenMarketTokenSelector,
  tokenSelector,
  tokenSupplySelector,
  tokenTradeHistorySelector,
} from '~/api/token'
import { marketplaceListingSelector } from './marketplace'

export type TokenMarketResult = {
  tokens: TokenMarket[]
  count: number
}

export type TokenListings = {
  listings: MarketplaceTokenListing[]
  count?: number
}

export type InscriptionsResult = {
  inscriptions: InscriptionWithMarket[]
  count: number
}

export type TokenHoldings = {
  holdings: TokenHolding[]
  count: number
}

export type TokensResult = {
  tokens: Token[]
  count: number
}

export type TokenHolders = {
  holders: TokenHolder[]
  count: number
}

export class AsteroidClient extends AsteroidService {
  constructor(url: string, wssUrl?: string) {
    super(url, wssUrl)
  }

  async getToken<T extends boolean = false>(
    ticker: string,
    detail = false as T,
    address?: string,
  ): Promise<TokenType<T> | undefined> {
    const queryOptions: QueryOptions<'token'> = {
      where: {
        ticker: {
          _eq: ticker,
        },
      },
    }

    let selector: ValueTypes['token'] = tokenSelector

    if (detail) {
      selector = tokenDetailSelector
    }

    if (address) {
      selector = {
        ...selector,
        token_holders: [
          {
            where: {
              address: {
                _eq: address,
              },
            },
          },
          tokenHolderAmountSelector,
        ],
      }
    }

    const result = await this.query({
      token: [queryOptions, selector],
    })
    return result.token[0] as TokenType<T> & {
      token_holders?: (TokenHolderAmount | undefined)[]
    }
  }

  async getTokenSupply(id: number): Promise<TokenSupply> {
    const result = await this.query({
      token: [
        {
          where: {
            id: {
              _eq: id,
            },
          },
        },
        tokenSupplySelector,
      ],
    })
    return result.token[0]
  }

  async getTokens(
    offset: number,
    limit: number,
    where: {
      currentOwner?: string
    } = {},
    orderBy?: ValueTypes['token_order_by'],
  ): Promise<TokensResult> {
    if (!orderBy) {
      orderBy = {
        date_created: order_by.desc,
      }
    }

    const queryWhere: ValueTypes['token_bool_exp'] = {}
    if (where.currentOwner) {
      queryWhere.current_owner = {
        _eq: where.currentOwner,
      }
    }

    const result = await this.query({
      token: [
        {
          offset,
          limit,
          order_by: [orderBy],
          where: queryWhere,
        },
        tokenSelector,
      ],
      token_aggregate: [{ where: queryWhere }, aggregateCountSelector],
    })
    return {
      tokens: result.token,
      count: result.token_aggregate.aggregate?.count ?? result.token.length,
    }
  }

  async getTokenHolders(
    tokenId: number,
    offset: number,
    limit: number,
    orderBy?: ValueTypes['token_holder_order_by'],
  ): Promise<TokenHolders> {
    if (!orderBy) {
      orderBy = {
        amount: order_by.desc,
      }
    }

    const where: ValueTypes['token_holder_bool_exp'] = {
      token_id: {
        _eq: tokenId,
      },
      amount: {
        _gt: 0,
      },
    }

    const result = await this.query({
      token_holder: [
        {
          offset,
          limit,
          order_by: [orderBy],
          where,
        },
        tokenHolderSelector,
      ],
      token_holder_aggregate: [{ where }, aggregateCountSelector],
    })
    return {
      holders: result.token_holder,
      count:
        result.token_holder_aggregate.aggregate?.count ??
        result.token_holder.length,
    }
  }

  async getTokenHolding(
    tokenId: number,
    address: string,
  ): Promise<TokenHolding | undefined> {
    const result = await this.query({
      token_holder: [
        {
          where: {
            address: {
              _eq: address,
            },
            token_id: {
              _eq: tokenId,
            },
          },
        },
        tokenHoldingSelector,
      ],
    })
    return result.token_holder[0]
  }

  async getTokenHoldings(
    address: string,
    offset = 0,
    limit = 500,
    search?: string | null,
    orderBy?: ValueTypes['token_holder_order_by'],
  ): Promise<TokenHoldings> {
    if (!orderBy) {
      orderBy = {
        amount: order_by.desc,
      }
    }

    const where: ValueTypes['token_holder_bool_exp'] = {
      address: {
        _eq: address,
      },
    }
    if (search) {
      where.token = {
        _or: [
          { name: { _like: `%${search}%` } },
          { name: { _like: `%${search.toUpperCase()}%` } },
          { ticker: { _like: `%${search}%` } },
          { ticker: { _like: `%${search.toUpperCase()}%` } },
        ],
      }
    }

    const holderResult = await this.query({
      token_holder: [
        {
          offset,
          limit,
          where,
          order_by: [orderBy],
        },
        tokenHoldingSelector,
      ],
      token_holder_aggregate: [{ where }, aggregateCountSelector],
    })
    return {
      holdings: holderResult.token_holder,
      count:
        holderResult.token_holder_aggregate.aggregate?.count ??
        holderResult.token_holder.length,
    }
  }

  async getTokenMarkets(
    offset: number = 0,
    limit: number = 20,
    where: {
      userAddress?: string
      search?: string | null
    } = {},
    orderBy?: ValueTypes['token_order_by'],
  ): Promise<TokenMarketResult> {
    if (!orderBy) {
      orderBy = {
        id: order_by.desc,
      }
    }

    let tokenHolders:
      | [QueryOptions<'token_holder'>, { amount: boolean }]
      | undefined = undefined
    if (where.userAddress) {
      tokenHolders = [
        {
          where: {
            address: {
              _eq: where.userAddress,
            },
          },
        },
        {
          amount: true,
        },
      ]
    }

    let queryWhere: ValueTypes['token_bool_exp'] | undefined
    if (where.search) {
      queryWhere = {
        _or: [
          { name: { _like: `%${where.search}%` } },
          { name: { _like: `%${where.search.toUpperCase()}%` } },
          { ticker: { _like: `%${where.search}%` } },
          { ticker: { _like: `%${where.search.toUpperCase()}%` } },
        ],
      }
    }

    const result = await this.query({
      token_aggregate: [{ where: queryWhere }, aggregateCountSelector],
      token: [
        { offset, limit, order_by: [orderBy], where: queryWhere },
        {
          ...tokenMarketTokenSelector,
          token_holders: tokenHolders,
          marketplace_cft20_details_aggregate: [
            {
              where: {
                marketplace_listing: {
                  is_cancelled: {
                    _eq: false,
                  },
                  is_filled: {
                    _eq: false,
                  },
                },
              },
            },
            {
              aggregate: {
                count: [{}, true],
              },
            },
          ],
        },
      ],
    })
    return {
      tokens: result.token,
      count: result.token_aggregate.aggregate?.count ?? result.token.length,
    }
  }

  async getTokenListings(
    tokenId: number,
    offset: number = 0,
    limit: number = 20,
    orderBy?: ValueTypes['marketplace_cft20_detail_order_by'],
    aggregate = false,
    where: { seller?: string; depositor?: string; currentBlock?: number } = {},
  ): Promise<TokenListings> {
    if (!orderBy) {
      orderBy = {
        amount: order_by.asc,
      }
    }

    const queryWhere: ValueTypes['marketplace_cft20_detail_bool_exp'] = {
      token_id: {
        _eq: tokenId,
      },
      marketplace_listing: {
        is_cancelled: {
          _eq: false,
        },
        is_filled: {
          _eq: false,
        },
      },
    }

    if (where.seller) {
      queryWhere.marketplace_listing = Object.assign(
        queryWhere.marketplace_listing || {},
        {
          seller_address: {
            _eq: where.seller,
          },
        },
      )
    }

    if (where.depositor && where.currentBlock) {
      queryWhere.marketplace_listing = Object.assign(
        queryWhere.marketplace_listing || {},
        {
          depositor_address: {
            _eq: where.seller,
          },
          depositor_timedout_block: {
            _gt: where.currentBlock,
          },
          is_deposited: {
            _eq: true,
          },
        },
      )
    }

    type Query = {
      marketplace_cft20_detail: [
        QueryOptions<'marketplace_cft20_detail'>,
        typeof tokenListingSelector,
      ]
      marketplace_cft20_detail_aggregate?: [
        QueryOptions<'marketplace_cft20_detail_aggregate'>,
        typeof aggregateCountSelector,
      ]
    }

    const query: Query = {
      marketplace_cft20_detail: [
        {
          where: queryWhere,
          offset,
          limit,
          order_by: [orderBy],
        },
        tokenListingSelector,
      ],
    }

    if (aggregate) {
      query.marketplace_cft20_detail_aggregate = [
        {
          where: queryWhere,
        },
        {
          aggregate: {
            count: [{}, true],
          },
        },
      ]
    }

    const listingsResult = await this.query(query)

    let count: number | undefined
    if (aggregate) {
      count =
        listingsResult.marketplace_cft20_detail_aggregate?.aggregate?.count
    }

    return {
      count,
      listings: listingsResult.marketplace_cft20_detail,
    }
  }

  tokenListingsSubscription(
    tokenId: number,
    limit: number,
  ): WSSubscription<{ marketplace_cft20_detail: MarketplaceTokenListing[] }> {
    return this.subscription({
      marketplace_cft20_detail: [
        {
          where: {
            token_id: {
              _eq: tokenId,
            },
            marketplace_listing: {
              is_cancelled: {
                _eq: false,
              },
              is_filled: {
                _eq: false,
              },
            },
          },
          limit,
          order_by: [
            {
              ppt: order_by.asc,
            },
          ],
        },
        tokenListingSelector,
      ],
    })
  }

  async getTokenFloorPrice(tokenId: number) {
    const floorListings = await this.getTokenListings(tokenId, 0, 1, {
      ppt: order_by.asc,
    })
    const listing = floorListings.listings[0]
    if (!listing) {
      return 0
    }
    return listing.ppt
  }

  // async getCollections(
  //   offset: number,
  //   limit: number,
  //   where: {
  //     creator?: string
  //   } = {},
  //   orderBy?: ValueTypes['collection_order_by'],
  // ): Promise<Collection[]> {
  //   if (!orderBy) {
  //     orderBy = {
  //       date_created: order_by.desc,
  //     }
  //   }

  //   const queryWhere: ValueTypes['collection_bool_exp'] | undefined = {}
  //   if (where.creator) {
  //     queryWhere.creator = {
  //       _eq: where.creator,
  //     }
  //   }

  //   const result = await this.query({
  //     collection: [
  //       {
  //         offset,
  //         limit,
  //         where: queryWhere,
  //         order_by: [orderBy],
  //       },
  //       collectionSelector,
  //     ],
  //   })

  //   return result.collection
  // }

  // async getCollection(symbol: string): Promise<Collection | undefined> {
  //   const result = await this.query({
  //     collection: [
  //       {
  //         where: {
  //           symbol: {
  //             _eq: symbol,
  //           },
  //         },
  //       },
  //       collectionSelector,
  //     ],
  //   })
  //   return result.collection[0]
  // }

  async getInscriptionWithMarket(
    hash: string,
  ): Promise<InscriptionWithMarket | undefined> {
    const result = await this.query({
      inscription: [
        {
          where: {
            transaction: {
              hash: {
                _eq: hash,
              },
            },
          },
        },
        {
          ...inscriptionSelector,
          marketplace_inscription_details: [
            {
              where: {
                marketplace_listing: {
                  is_cancelled: { _eq: false },
                  is_filled: { _eq: false },
                },
              },
            },
            inscriptionListingSelector,
          ],
        },
      ],
    })

    const inscription = result.inscription[0]

    return {
      ...inscription,
      marketplace_listing:
        inscription?.marketplace_inscription_details?.[0]?.marketplace_listing,
    }
  }

  async getInscription(hash: string): Promise<Inscription | undefined> {
    const result = await this.query({
      inscription: [
        {
          where: {
            transaction: {
              hash: {
                _eq: hash,
              },
            },
          },
        },
        inscriptionSelector,
      ],
    })
    return result.inscription[0]
  }

  async getReservedInscriptions(
    depositor: string,
    currentBlock: number,
    limit: number,
  ): Promise<InscriptionWithMarket[]> {
    const res = await this.query({
      marketplace_inscription_detail: [
        {
          where: {
            marketplace_listing: {
              is_cancelled: {
                _eq: false,
              },
              is_filled: {
                _eq: false,
              },
              is_deposited: {
                _eq: true,
              },
              depositor_address: {
                _eq: depositor,
              },
              depositor_timedout_block: {
                _gt: currentBlock,
              },
            },
          },
          limit,
          order_by: [
            {
              id: order_by.asc,
            },
          ],
        },
        {
          inscription: {
            ...inscriptionSelector,
          },
          marketplace_listing: {
            ...marketplaceListingSelector,
          },
        },
      ],
    })

    return res.marketplace_inscription_detail.map((i) => ({
      ...i.inscription!,
      marketplace_listing: i.marketplace_listing,
    }))
  }

  async getUserListedInscriptions(
    address: string,
    offset: number,
    limit: number,
  ): Promise<InscriptionsResult> {
    const where: ValueTypes['marketplace_inscription_detail_bool_exp'] = {
      marketplace_listing: {
        seller_address: {
          _eq: address,
        },
        is_cancelled: {
          _eq: false,
        },
        is_filled: {
          _eq: false,
        },
      },
    }

    const res = await this.query({
      marketplace_inscription_detail: [
        {
          limit,
          offset,
          where,
          order_by: [{ id: order_by.desc }],
        },
        {
          inscription: inscriptionSelector,
          marketplace_listing: marketplaceListingSelector,
        },
      ],
      marketplace_inscription_detail_aggregate: [
        {
          where,
        },
        aggregateCountSelector,
      ],
    })
    return {
      inscriptions: res.marketplace_inscription_detail.map((i) => ({
        ...i.inscription!,
        marketplace_listing: i.marketplace_listing,
      })),
      count:
        res.marketplace_inscription_detail_aggregate.aggregate?.count ??
        res.marketplace_inscription_detail.length,
    }
  }

  async getUserInscriptions(
    address: string,
    offset: number,
    limit: number,
  ): Promise<InscriptionsResult> {
    const where: ValueTypes['inscription_bool_exp'] = {
      current_owner: {
        _eq: address,
      },
    }

    const res = await this.query({
      inscription: [
        {
          limit,
          offset,
          where,
          order_by: [{ id: order_by.desc }],
        },
        inscriptionSelector,
      ],
      inscription_aggregate: [
        {
          where,
        },
        aggregateCountSelector,
      ],
    })
    return {
      inscriptions: res.inscription,
      count:
        res.inscription_aggregate.aggregate?.count ?? res.inscription.length,
    }
  }

  async getInscriptions(
    offset: number,
    limit: number,
    where: {
      collectionId?: number
      currentOwner?: string
      onlySingle?: boolean
      onlyBuy?: boolean
      idLTE?: number
      priceGTE?: number
      priceLTE?: number
      search?: string | null
    } = {},
    orderBy?: ValueTypes['inscription_market_order_by'],
  ): Promise<InscriptionsResult> {
    const queryWhere: ValueTypes['inscription_market_bool_exp'] | undefined = {}

    // if (where.collectionId) {
    //   queryWhere.collection_id = {
    //     _eq: where.collectionId,
    //   }
    // } else if (where.onlySingle) {
    //   queryWhere.collection_id = {
    //     _is_null: true,
    //   }
    // }
    if (where.currentOwner) {
      queryWhere._or = [
        {
          inscription: {
            current_owner: {
              _eq: where.currentOwner,
            },
          },
        },
        {
          marketplace_listing: {
            seller_address: {
              _eq: where.currentOwner,
            },
          },
        },
      ]
    }

    if (where.search) {
      const searchResult = await this.query({
        find_inscription_by_name: [
          {
            args: {
              query_name: '%' + where.search + '%',
            },
          },
          {
            id: true,
          },
        ],
      })
      queryWhere.id = {
        _in: searchResult.find_inscription_by_name.map((i) => i.id as number),
      }
    }

    if (where.onlyBuy) {
      queryWhere.marketplace_listing = Object.assign(
        queryWhere.marketplace_listing || {},
        {
          is_cancelled: {
            _eq: false,
          },
          is_filled: {
            _eq: false,
          },
        },
      )
    }

    if (where.idLTE) {
      queryWhere.inscription = Object.assign(queryWhere.inscription || {}, {
        id: {
          _lte: where.idLTE,
        },
      })
    }

    if (where.priceGTE || where.priceLTE) {
      queryWhere.marketplace_listing = Object.assign(
        queryWhere.marketplace_listing || {},
        {
          total: {
            _lte: where.priceLTE,
            _gte: where.priceGTE,
          },
        },
      )
    }

    const result = await this.query({
      inscription_market_aggregate: [
        { where: queryWhere },
        aggregateCountSelector,
      ],
      inscription_market: [
        {
          offset,
          limit,
          order_by: orderBy ? [orderBy] : undefined,
          where: queryWhere,
        },
        {
          inscription: {
            ...inscriptionSelector,
          },
          marketplace_listing: {
            ...marketplaceListingSelector,
          },
        },
      ],
    })
    return {
      inscriptions: result.inscription_market.map((i) => ({
        ...i.inscription!,
        marketplace_listing: i.marketplace_listing,
      })),
      count:
        result.inscription_market_aggregate.aggregate?.count ??
        result.inscription_market.length,
    }
  }

  async getInscriptionHistory(
    inscriptionId: number,
    orderBy?: ValueTypes['inscription_history_order_by'],
  ): Promise<InscriptionHistory[]> {
    if (!orderBy) {
      orderBy = {
        height: order_by.desc,
      }
    }

    const result = await this.query({
      inscription_history: [
        {
          where: {
            inscription: {
              id: {
                _eq: inscriptionId,
              },
            },
          },
          order_by: [orderBy],
        },
        inscriptionHistorySelector,
      ],
    })
    return result.inscription_history
  }

  async getTokenAddressHistory(
    tokenId: number,
    address: string,
    orderBy?: ValueTypes['token_address_history_order_by'],
  ): Promise<TokenAddressHistory[]> {
    if (!orderBy) {
      orderBy = {
        height: order_by.desc,
      }
    }

    const result = await this.query({
      token_address_history: [
        {
          where: {
            _or: [
              {
                sender: {
                  _eq: address,
                },
              },
              {
                receiver: {
                  _eq: address,
                },
              },
            ],
            token_id: {
              _eq: tokenId,
            },
          },
          order_by: [orderBy],
        },
        tokenAddressHistorySelector,
      ],
    })
    return result.token_address_history
  }

  async getTransactionStatus(txHash: string) {
    const result = await this.query({
      transaction: [
        {
          where: {
            hash: {
              _eq: txHash,
            },
          },
        },
        {
          status_message: true,
        },
      ],
    })

    const transaction = result.transaction[0]
    if (!transaction) {
      return
    }

    return transaction.status_message
  }

  async getInscriptionTradeHistory(
    offset = 0,
    limit = 200,
  ): Promise<InscriptionTradeHistory[]> {
    const result = await this.query({
      inscription_trade_history: [
        {
          offset,
          limit,
          order_by: [
            {
              date_created: order_by.desc,
            },
          ],
        },
        inscriptionTradeHistorySelector,
      ],
    })
    return result.inscription_trade_history
  }

  async getTokenTradeHistory(
    tokenId?: number,
    offset = 0,
    limit = 100,
  ): Promise<TokenTradeHistory[]> {
    const where: ValueTypes['token_trade_history_bool_exp'] = {}
    if (tokenId) {
      where.token_id = {
        _eq: tokenId,
      }
    }

    const result = await this.query({
      token_trade_history: [
        {
          where,
          offset,
          limit,
          order_by: [
            {
              date_created: order_by.desc,
            },
          ],
        },
        tokenTradeHistorySelector,
      ],
    })
    return result.token_trade_history
  }

  statusSubscription(chainId: string) {
    return this.ws!('subscription')({
      status: [
        {
          where: {
            chain_id: {
              _eq: chainId,
            },
          },
        },
        statusSelector,
      ],
    })
  }

  // inscriptionTradeHistorySubscription(offset = 0, limit = 200) {
  //   return this.ws<'subscription', ScalarDefinition>('subscription')({
  //     inscription_trade_history: [
  //       {
  //         offset,
  //         limit,
  //         order_by: [
  //           {
  //             date_created: order_by.desc,
  //           },
  //         ],
  //       },
  //       inscriptionTradeHistorySelector,
  //     ],
  //   })
  // }
}
