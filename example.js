const Dexters = require('.')

async function main() {
  const dexter = new Dexters(137) // Polygon mainnet
  const currencySymbol = dexter.chainMetadata.nativeCurrency.symbol

  console.log('currencySymbol', currencySymbol)

  const dexIds = dexter.getDexIds()

  console.log('dexIds', dexIds)

  const sushiswap = dexter.getDex('sushiswap')

  let wrappedNativePriceUSD

  await sushiswap.addStablecoinsOracleListener(({ timestamp, priceUSD }) => {
    console.log('Wrapped native USD', timestamp, priceUSD.toString())

    wrappedNativePriceUSD = priceUSD
  })

  const wethAddress = sushiswap.getToken('WETH').address
  const sushiAddress = sushiswap.getToken('SUSHI').address

  const wethSushiPairAddress = await sushiswap.getPairAddress(wethAddress, sushiAddress)

  await sushiswap.addOracleListener(wethSushiPairAddress, data => {
    console.log('WETH-SUSHI', data.timestamp, data[wethAddress].price.toString(), data[sushiAddress].price.toString())
  })
}

main()
