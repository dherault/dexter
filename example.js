const Dexters = require('./src/Dexters')

const WETH = '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619'
const WMATIC = '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'

async function main() {
  const dexters = new Dexters(137) // Polygon mainnet

  const sushiswap = dexters.getDex('sushiswap')

  sushiswap.addSyncListener(WMATIC, WETH, data => console.log('Sync', data))
}

main()
