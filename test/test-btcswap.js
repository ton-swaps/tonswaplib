async function testBtcSwap() {

  const ob = new TonSwapOrderbook();

  await ob.init()

  const initiatorSeed = 'mystery lumber fiber today spray reform april boring stomach undo horn muscle'
  const receiverSeed = 'strong venture lamp gadget impulse impose reject undo tomato adapt method invest'

  const temp = new ob.swappers.BTC.BtcSwapInitiator()

  const initiatorPK = temp.swap.getPublicKey(initiatorSeed)
  const receiverPK = temp.swap.getPublicKey(receiverSeed)

  const secret = '0x' + ob.hexAlign(ob.bytesToHex(await ob.generateSecret()), 64)
  const secretHash = '0x' + ob.hexAlign(await ob.sha256(secret), 64)

  const initiator = new ob.swappers.BTC.BtcSwapInitiator(initiatorPK, receiverPK, initiatorSeed, secret, secretHash)
  const receiver = new ob.swappers.BTC.BtcSwapReceiver(initiatorPK, receiverPK, receiverSeed, secret, secretHash)

  const initiatorAddress = temp.swap.getAddress(initiatorSeed)
  const receiverAddress = temp.swap.getAddress(initiatorSeed)

  const initiatorUnspents = await initiator.swap.btc.fetchUnspents(initiatorPK)
  const receiverUnspents = await initiator.swap.btc.fetchUnspents(receiverPK)

  console.log('initiatorAddress', initiatorAddress, initiatorUnspents)
  console.log('receiverAddress', receiverAddress, receiverUnspents)

  return

  const createTx = initiator.create(0.001 * 1e8, Math.floor(Date.now() / 1000) + 3600)
  console.log('createTx', createTx)

}

