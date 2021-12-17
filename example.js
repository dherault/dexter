const { ethers } = require('ethers')

const Dexters = require('.')

async function main() {
  const dexter = new Dexters(1666600000) // Harmony mainnet
  const currencySymbol = dexter.chainMetadata.nativeCurrency.symbol

  console.log('currencySymbol', currencySymbol)

  const dexIds = dexter.getDexIds()

  console.log('dexIds', dexIds)

  const sushiswap = dexter.getDex('sushiswap')
  const pairAddresses = await sushiswap.getAllPairAddresses()

  // console.log('pairAddresses', pairAddresses)

  pairAddresses.forEach(pairAddress => {
    sushiswap.listenToPair(pairAddress)
  })
  // const sushi = sushiswap.getToken('SUSHI').address
  // const usdt = sushiswap.getToken('USDT').address
  // const pairAddress = await sushiswap.getPairAddress(sushi, usdt)
  // console.log('pairAddress', pairAddress)

  // const price = await sushiswap.getTokenPrice()
  // console.log('SUSHI', price)
}

main()
