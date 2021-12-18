const { ethers } = require('ethers')

const Dexters = require('.')

async function main() {
  const dexter = new Dexters(1666600000) // Harmony mainnet
  const currencySymbol = dexter.chainMetadata.nativeCurrency.symbol

  console.log('currencySymbol', currencySymbol)

  const dexIds = dexter.getDexIds()

  console.log('dexIds', dexIds)

  const sushiswap = dexter.getDex('sushiswap')
  // const pairAddresses = await sushiswap.getAllPairAddresses()

  // console.log('pairAddresses', pairAddresses)

  // pairAddresses.forEach(pairAddress => {
  //   console.log('Listening to', pairAddress)

  //   sushiswap.addPairListener(pairAddress, processPairUpdate(sushiswap, pairAddress))
  // })

  const tokenAddress = sushiswap.getToken('WONE').address

  sushiswap.addPriceListener(tokenAddress, processPriceUpdate(sushiswap, tokenAddress))
  // sushiswap.
  // console.log('pairAddress', pairAddress)

  // const price = await sushiswap.getTokenPrice()
  // console.log('SUSHI', price)
}

function processPairUpdate(dex, pairAddress) {
  const [tokenAddress0, tokenAddress1] = dex.getPairTokenAddresses(pairAddress)
  const { symbol: symbol0 } = dex.getToken(tokenAddress0)
  const { symbol: symbol1 } = dex.getToken(tokenAddress1)

  return async ({
    timestamp,
    [tokenAddress0]: { reserve: reserve0, timeWeightedAveragePrice: timeWeightedAveragePrice0 },
    [tokenAddress1]: { reserve: reserve1, timeWeightedAveragePrice: timeWeightedAveragePrice1 },
  }) => {
    console.log(symbol0, symbol1, 'pair update', timestamp)
    console.log(`${symbol0} reserve: ${ethers.utils.formatEther(reserve0)}`)
    console.log(`${symbol1} reserve: ${ethers.utils.formatEther(reserve1)}`)
    console.log(`${symbol0} TWAP: ${ethers.utils.formatEther(timeWeightedAveragePrice0)}`)
    console.log(`${symbol1} TWAP: ${ethers.utils.formatEther(timeWeightedAveragePrice1)}`)
  }
}

function processPriceUpdate(dex, tokenAddress) {
  const { symbol } = dex.getToken(tokenAddress)

  return async ({ timestamp, price, relativePrice }) => {
    console.log(symbol, 'price update', timestamp)
    // console.log(`${symbol} price: ${ethers.utils.formatEther(price)}`)
    // console.log(`${symbol} price: ${ethers.utils.formatEther(relativePrice)}`)
    // console.log(`${symbol} price: ${ethers.utils.formatEther(relativePrice.div(price))}`)
    // console.log(`${symbol} price: ${ethers.utils.formatEther(relativePrice.mul(price))}`)
    // console.log(`${symbol} price: ${ethers.utils.formatEther(price.div(relativePrice))}`)
  }
}

main()
