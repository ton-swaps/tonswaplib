async function testBtcSwap() {

  const ob = new TonSwapOrderbook();

  await ob.init()

  const refund = false

  const initiatorSeed = 'seed 1'
  const receiverSeed = 'seed 2'

  const temp = new ob.swappers.BTC.BtcSwapInitiator()

  const initiatorPK = temp.swap.getPublicKey(initiatorSeed)
  const receiverPK = temp.swap.getPublicKey(receiverSeed)

  const secret = '0x' + ob.hexAlign(ob.bytesToHex(await ob.generateSecret()), 64)
  //const secret = '0x'
  const secretHash = '0x' + ob.hexAlign(await ob.sha256(secret), 64)
  console.log('secret', secret, secretHash)

  const initiator = new ob.swappers.BTC.BtcSwapInitiator(initiatorPK, receiverPK, initiatorSeed, secretHash)
  const receiver = new ob.swappers.BTC.BtcSwapReceiver(initiatorPK, receiverPK, receiverSeed, secret, secretHash)

  const initiatorAddress = temp.swap.getAddress(initiatorSeed)
  const receiverAddress = temp.swap.getAddress(receiverSeed)

  console.log('initiatorAddress', initiatorAddress)
  console.log('receiverAddress', receiverAddress)


  const value = 0.0007 * 1e8
  const expire = Math.floor(Date.now() / 1000) + (refund ? 300 : 4*3600)
  //const expire = 0

  console.log('value', value, 'expire', expire)
  // initiatorAddress 
  // receiverAddress 


  const createTx = await initiator.create(value, expire)
  // const createTx = ''
  // script address 
  console.log('createTx', createTx, value, expire)

  while (1) {
    console.log('check swap tx')
    const res = await initiator.swap.checkTX(createTx)
    if (res)
      break

    await new Promise(resolve => setTimeout(resolve, 10000))
  }

  if (!refund) {
    if (1) {
    while(1) {
      const swapRes = await receiver.getSwap(value, expire)
      if (swapRes)
        break

      await new Promise(resolve => setTimeout(resolve, 10000))
    }

    while(1) {
      try {
        const res = await receiver.withdraw(value, expire, secret)
        break
      } catch (e) {
        console.log('withdraw error:', e)
        await new Promise(resolve => setTimeout(resolve, 10000000))
      }
    }
  }

    for (let i = 0; i < 60; i++) {
      const balance = await receiver.getScriptBalance(expire)
      console.log('script balance', balance)
      if (balance === 0) {
        break
      }
      if (i === 59) {
        console.log('NORMAL TEST FAIL');
        return
      }
      await new Promise(resolve => setTimeout(resolve, 60000))
    }

    let extractedSecret;
    while(1) {
      try {
        extractedSecret = await initiator.getSwap(expire)
        if (extractedSecret)
          break
      } catch (e) {
        console.log('getsecret error:', e)
      }
      await new Promise(resolve => setTimeout(resolve, 10000))
    }

    if (secret === '0x' + extractedSecret) {
      console.log('NORMAL TEST SUCCESS');
    } else {
      console.log('NORMAL TEST FAIL');
    }

  } else {

    for (let i = 0; i < 60; i++) {
      const balance = await initiator.getScriptBalance(expire)
      console.log('script balance', balance)
      if (balance > 0) {
        break
      }
      if (i === 59) {
        console.log('REFUND TEST FAIL');
        return
      }
      await new Promise(resolve => setTimeout(resolve, 60000))
    }

    while (1) {
      if (Math.floor(Date.now() / 1000) > expire) {
        break
      }

      await new Promise(resolve => setTimeout(resolve, 10000))
    }

    while(1) {
      try {
        const res = await initiator.withdrawWithTimeout(value, expire)
        break
      } catch (e) {
        console.log('withdraw error:', e)
        await new Promise(resolve => setTimeout(resolve, 10000000))
      }
    }

    for (let i = 0; i < 60; i++) {
      const balance = await initiator.getScriptBalance(expire)
      console.log('script balance', balance)
      if (balance === 0) {
        console.log('REFUND TEST SUCCESS');
        return
      }
      await new Promise(resolve => setTimeout(resolve, 60000))
    }
    console.log('REFUND TEST FAIL');
    
  }


}

