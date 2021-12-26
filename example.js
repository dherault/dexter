const { ethers } = require('ethers')

const Dexters = require('.')

async function main() {
  const dexter = new Dexters(137) // Polygon mainnet
  const currencySymbol = dexter.chainMetadata.nativeCurrency.symbol

  console.log('currencySymbol', currencySymbol)

  const dexIds = dexter.getDexIds()

  console.log('dexIds', dexIds)

  const sushiswap = dexter.getDex('sushiswap')

  await sushiswap.startListeningToWrappedNativePriceUpdates()

  const wethAddress = sushiswap.getToken('WETH').address

  await sushiswap.addWrappedNativePriceListener(wethAddress, ({ timestamp, price }) => {
    console.log('WETH', timestamp, price.toString())
    console.log('WETH', timestamp, price.times(sushiswap.wrappedNativePriceInUsd).toString())
  })
}

main()
