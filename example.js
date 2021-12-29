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
    console.log('MATIC and WMATIC $ price:', timestamp, priceUSD.toString())

    wrappedNativePriceUSD = priceUSD
  })

  const wmaticAddress = sushiswap.getToken('WMATIC').address
  const wethAddress = sushiswap.getToken('WETH').address
  const sushiAddress = sushiswap.getToken('SUSHI').address

  // const wmaticWethPairAddress = await sushiswap.getPairAddress(wmaticAddress, wethAddress)
  // const wmaticSushiPairAddress = await sushiswap.getPairAddress(wmaticAddress, sushiAddress)
  // const wethSushiPairAddress = await sushiswap.getPairAddress(wethAddress, sushiAddress)

  await sushiswap.addOracleListener(wmaticAddress, wethAddress, data => {
    console.log('WMATIC-WETH:', data.timestamp, data[wmaticAddress].price.toString(), data[wethAddress].price.toString())
    console.log('WETH $ price:', data[wethAddress].price.times(wrappedNativePriceUSD).toString())
  })
  // await sushiswap.addOracleListener(wmaticSushiPairAddress, data => {
  //   console.log('WMATIC-SUSHI:', data.timestamp, data[wmaticAddress].price.toString(), data[sushiAddress].price.toString())
  //   console.log('SUSHI $ price:', data[sushiAddress].price.times(wrappedNativePriceUSD).toString())
  // })
  // await sushiswap.addOracleListener(wethSushiPairAddress, data => {
  //   console.log('WETH-SUSHI:', data.timestamp, data[wethAddress].price.toString(), data[sushiAddress].price.toString())
  // })
}

main()
