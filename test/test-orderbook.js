async function testOrderbook() {
  const walletAddress = '0:f6c87db939ef0e42d51b6ce40317d83f96b6cefd66664ba01dfea4bfa71b34b4';
  const walletSeed = 'time mouse entire edit cruel bamboo convince orphan floor canoe clever lock';
  
  let ob = new TonSwapOrderbook('0:fc8501651ed2a9250895ba1074f36454c29b9eb1d354b194d99230d7e398ef6a');

  await ob.init()

  const loginInfoStart = await ob.login(walletAddress, walletSeed)
  console.log('loginInfoStart', loginInfoStart)

  const accountStart = await ob.wallet.getAccount()
  console.log('accountStart', accountStart)

  const orderbookStart = await ob.wallet.getAccount(ob.getAddress())
  console.log('orderbookStart', orderbookStart)

  {
    console.log('STAGE 1: deposit, withdraw over balance (must fail), withdraw all')

    const deposit = await ob.deposit(1000000000, walletSeed)
    console.log('deposit', deposit)
    await new Promise(resolve => setTimeout(resolve, 30000))

    const loginInfoDeposit = await ob.updateInfo()
    console.log('loginInfoDeposit', loginInfoDeposit)

    const accountDeposit = await ob.wallet.getAccount()
    console.log('accountDeposit', accountDeposit)

    const orderbookDeposit = await ob.wallet.getAccount(ob.getAddress())
    console.log('orderbookDeposit', orderbookDeposit)

    // == 1
    if (ob.BigInteger(loginInfoDeposit.freeFunds).subtract(loginInfoStart.freeFunds).compare(1000000000) !== 0) {
      console.error('deposit fail 1')
      return
    }

    // > 1
    if (ob.BigInteger(accountStart.balance).subtract(accountDeposit.balance).compare(1000000000) !== 1) {
      console.error('deposit fail 2', )
      return
    }

    // ~1 TODO
    if (ob.BigInteger(orderbookDeposit.balance).subtract(orderbookStart.balance).compare(500000000) !== 1) {
      console.error('deposit fail 3')
      return
    }

    const withdrawBad = await ob.withdraw(20000000000, walletSeed)
    console.log('withdrawBad', withdrawBad)
    await new Promise(resolve => setTimeout(resolve, 30000))

    const loginInfoWithdrawBad = await ob.updateInfo()
    console.log('loginInfoWithdrawBad', loginInfoWithdrawBad)

    const orderbookWithdrawBad = await ob.wallet.getAccount(ob.getAddress())
    console.log('orderbookWithdrawBad', orderbookWithdrawBad)

    // == 0
    if (ob.BigInteger(loginInfoDeposit.freeFunds).subtract(loginInfoWithdrawBad.freeFunds).compare(0) !== 0) {
      console.error('withdraw bad fail 1')
      return
    }
    // ~0 storage fee? 
    if (ob.BigInteger(orderbookDeposit.balance).subtract(orderbookWithdrawBad.balance).compare(1000000) !== -1) {
      console.error('withdraw bad fail 2')
      return
    }


    const withdrawGood = await ob.withdraw(1000000000, walletSeed)
    console.log('withdrawGood', withdrawGood)
    await new Promise(resolve => setTimeout(resolve, 30000))

    const loginInfoWithdrawGood = await ob.updateInfo()
    console.log('loginInfoWithdrawGood', loginInfoWithdrawGood)

    const orderbookWithdrawGood = await ob.wallet.getAccount(ob.getAddress())
    console.log('orderbookWithdrawGood', orderbookWithdrawGood)

    // == 1
    if (ob.BigInteger(loginInfoDeposit.freeFunds).subtract(orderbookWithdrawGood.freeFunds).compare(1000000000) !== 0) {
      console.error('withdraw good fail 1')
      return
    }
    // > 1
    if (ob.BigInteger(orderbookDeposit.balance).subtract(orderbookWithdrawGood.balance).compare(1000000000) !== 1) {
      console.error('withdraw good fail 2')
      return
    }

    console.log('STAGE 1: done')
  }

  {
    console.log('STAGE 1.1: deposit')

    const deposit = await ob.deposit(1000000000, walletSeed)
    console.log('deposit', deposit)
    await new Promise(resolve => setTimeout(resolve, 60000))

    const loginInfoDeposit = await ob.updateInfo()
    console.log('loginInfoDeposit', loginInfoDeposit)
    if (loginInfoDeposit.freeFunds !== '0x3b9aca00') throw Error()
    if (loginInfoDeposit.ordersFunds !== '0x0') throw Error()
    if (loginInfoDeposit.lockedFunds !== '0x0') throw Error()

    console.log('STAGE 1.1: done')
  }

  {
    console.log('STAGE 2: Create order and close')

    const myOrders1 = await ob.getMyOrders()
    console.log('myOrders1', myOrders1)
    if (myOrders1.length !== 0) throw Error()

    const allOrders1 = await ob.getOrders('TON CRYSTAL', 'USDT')
    console.log('allOrders1', allOrders1)
    if (allOrders1.length !== 0) throw Error()

    const loginInfo1 = await ob.updateInfo()
    console.log('loginInfo1', loginInfo1)
    if (loginInfo1.freeFunds !== '0x3b9aca00') throw Error()
    if (loginInfo1.ordersFunds !== '0x0') throw Error()
    if (loginInfo1.lockedFunds !== '0x0') throw Error()
    
    const newOrder1 = await ob.createOrder('TON CRYSTAL', 'USDT', '0x7A120', '0x3B9ACA00', '0x3B9ACA00', 3600, '0x12345', walletSeed)
    console.log('newOrder1', newOrder1)
    await new Promise(resolve => setTimeout(resolve, 60000))

    const myOrders2 = await ob.getMyOrders()
    console.log('myOrders2', myOrders2)
    if (myOrders2.length !== 1) throw Error()
    if (myOrders2[0].confirmed !== false) throw Error()
    if (myOrders2[0].id !== walletAddress) throw Error()
    if (myOrders2[0].value !== '0x3b9aca00') throw Error()
    if (myOrders2[0].minValue !== '0x3b9aca00') throw Error()
    if (myOrders2[0].exchangeRate !== "0x7a120") throw Error()
    if (myOrders2[0].initiatorTargetAddress !== "0x12345") throw Error()
    if (myOrders2[0].timeLockSlot !== "0xe10") throw Error()

    const allOrders2 = await ob.getOrders('TON CRYSTAL', 'USDT')
    console.log('allOrders2', allOrders2)
    if (allOrders2.length !== 1) throw Error()

    const loginInfo2 = await ob.updateInfo()
    console.log('loginInfo2', loginInfo2)
    if (loginInfo2.freeFunds !== '0x0') throw Error()
    if (loginInfo2.ordersFunds !== '0x3b9aca00') throw Error()
    if (loginInfo2.lockedFunds !== '0x0') throw Error()

    const closeOrder1 = await ob.closeOrder(myOrders2[0], walletSeed)
    console.log('closeOrder1', closeOrder1)
    await new Promise(resolve => setTimeout(resolve, 60000))

    const myOrders3 = await ob.getMyOrders()
    console.log('myOrders3', myOrders3)
    if (myOrders3.length !== 0) throw Error()

    const allOrders3 = await ob.getOrders('TON CRYSTAL', 'USDT')
    console.log('allOrders3', allOrders3)
    if (allOrders3.length !== 0) throw Error()

    const loginInfo3 = await ob.updateInfo()
    console.log('loginInfo3', loginInfo3)
    if (loginInfo3.freeFunds !== '0x3b9aca00') throw Error()
    if (loginInfo3.ordersFunds !== '0x0') throw Error()
    if (loginInfo3.lockedFunds !== '0x0') throw Error()

    console.log('STAGE 2: done')
  }

  {
    console.log('STAGE 3: Create order, confirm, try close (must fail), try finish with timeout (must fail), finish with secret')

    const myOrders1 = await ob.getMyOrders()
    console.log('myOrders1', myOrders1)
    if (myOrders1.length !== 0) throw Error()

    const allOrders1 = await ob.getOrders('TON CRYSTAL', 'USDT')
    console.log('allOrders1', allOrders1)
    if (allOrders1.length !== 0) throw Error()

    const loginInfo1 = await ob.updateInfo()
    console.log('loginInfo1', loginInfo1)
    if (loginInfo1.freeFunds !== '0x3b9aca00') throw Error()
    if (loginInfo1.ordersFunds !== '0x0') throw Error()
    if (loginInfo1.lockedFunds !== '0x0') throw Error()
    
    const newOrder1 = await ob.createOrder('TON CRYSTAL', 'USDT', '0x7A120', '0x3B9ACA00', '0x3B9ACA00', 3600, '0x12345', walletSeed)
    console.log('newOrder1', newOrder1)
    await new Promise(resolve => setTimeout(resolve, 60000))

    const myOrders2 = await ob.getMyOrders()
    console.log('myOrders2', myOrders2)
    if (myOrders2.length !== 1) throw Error()
    if (myOrders2[0].confirmed !== false) throw Error()

    const allOrders2 = await ob.getOrders('TON CRYSTAL', 'USDT')
    console.log('allOrders2', allOrders2)
    if (allOrders2.length !== 1) throw Error()

    const loginInfo2 = await ob.updateInfo()
    console.log('loginInfo2', loginInfo2)
    if (loginInfo2.freeFunds !== '0x0') throw Error()
    if (loginInfo2.ordersFunds !== '0x3b9aca00') throw Error()
    if (loginInfo2.lockedFunds !== '0x0') throw Error()

    const confirmOrder1 = await ob.confirmOrder(myOrders2[0], '0x3B9ACA00', '0x6789', walletSeed)
    console.log('confirmOrder1', confirmOrder1)
    await new Promise(resolve => setTimeout(resolve, 60000))

    const myOrders3 = await ob.getMyOrders()
    console.log('myOrders3', myOrders3)
    if (myOrders3.length !== 1) throw Error()
    if (myOrders3[0].confirmed !== true) throw Error()
    if (myOrders3[0].confirmatorSourceAddress !== '0x6789') throw Error()

    const allOrders3 = await ob.getOrders('TON CRYSTAL', 'USDT')
    console.log('allOrders3', allOrders3)
    if (allOrders3.length !== 0) throw Error()

    const loginInfo3 = await ob.updateInfo()
    console.log('loginInfo3', loginInfo3)
    if (loginInfo3.freeFunds !== '0x0') throw Error()
    if (loginInfo3.ordersFunds !== '0x0') throw Error()
    if (loginInfo3.lockedFunds !== '0x3b9aca00') throw Error()

    try {
      const closeOrder1 = await ob.closeOrder(myOrders3[0], walletSeed, true)
      console.log('closeOrder1', closeOrder1)
      console.log('closeOrder check fail')
      return
    } catch (e) {}

    const closeOrder1 = await ob.closeOrder(myOrders3[0], walletSeed, false)
    console.log('closeOrder1', closeOrder1)
    await new Promise(resolve => setTimeout(resolve, 60000))

    const myOrders4 = await ob.getMyOrders()
    console.log('myOrders4', myOrders4)
    if (myOrders4.length !== 1) throw Error()
    if (myOrders4[0].confirmed !== true) throw Error()

    const loginInfo4 = await ob.updateInfo()
    console.log('loginInfo4', loginInfo4)
    if (loginInfo4.freeFunds !== '0x0') throw Error()
    if (loginInfo4.ordersFunds !== '0x0') throw Error()
    if (loginInfo4.lockedFunds !== '0x3b9aca00') throw Error()


    const finishOrder2 = await ob.finishOrderWithTimeout(myOrders4[0], walletSeed)
    console.log('finishOrder2', finishOrder2)
    await new Promise(resolve => setTimeout(resolve, 60000))

    const myOrders6 = await ob.getMyOrders()
    console.log('myOrders6', myOrders6)
    if (myOrders6.length !== 1) throw Error()

    const loginInfo6 = await ob.updateInfo()
    console.log('loginInfo6', loginInfo6)
    if (loginInfo6.freeFunds !== '0x0') throw Error()
    if (loginInfo6.ordersFunds !== '0x0') throw Error()
    if (loginInfo6.lockedFunds !== '0x3b9aca00') throw Error()


    let secret = ob.hexToBytes(localStorage.getItem(myOrders4[0].secretHash))

    const finishOrder1 = await ob.finishOrderWithSecret(myOrders4[0], secret, walletSeed)
    console.log('finishOrder1', finishOrder1)
    await new Promise(resolve => setTimeout(resolve, 60000))

    const myOrders5 = await ob.getMyOrders()
    console.log('myOrders5', myOrders5)
    if (myOrders5.length !== 0) throw Error()

    const loginInfo5 = await ob.updateInfo()
    console.log('loginInfo5', loginInfo5)
    if (loginInfo5.freeFunds !== '0x3b9aca00') throw Error()
    if (loginInfo5.ordersFunds !== '0x0') throw Error()
    if (loginInfo5.lockedFunds !== '0x0') throw Error()

    console.log('STAGE 3: done')
  }

  {
    console.log('STAGE 4: Create order, confirm, wait 1 hour, finish with timeout')

    const myOrders1 = await ob.getMyOrders()
    console.log('myOrders1', myOrders1)
    if (myOrders1.length !== 0) throw Error()

    const allOrders1 = await ob.getOrders('TON CRYSTAL', 'USDT')
    console.log('allOrders1', allOrders1)
    if (allOrders1.length !== 0) throw Error()

    const loginInfo1 = await ob.updateInfo()
    console.log('loginInfo1', loginInfo1)
    if (loginInfo1.freeFunds !== '0x3b9aca00') throw Error()
    if (loginInfo1.ordersFunds !== '0x0') throw Error()
    if (loginInfo1.lockedFunds !== '0x0') throw Error()
    
    const newOrder1 = await ob.createOrder('TON CRYSTAL', 'USDT', '0x7A120', '0x3B9ACA00', '0x3B9ACA00', 3600, '0x12345', walletSeed)
    console.log('newOrder1', newOrder1)
    await new Promise(resolve => setTimeout(resolve, 60000))

    const myOrders2 = await ob.getMyOrders()
    console.log('myOrders2', myOrders2)
    if (myOrders2.length !== 1) throw Error()
    if (myOrders2[0].confirmed !== false) throw Error()

    const allOrders2 = await ob.getOrders('TON CRYSTAL', 'USDT')
    console.log('allOrders2', allOrders2)
    if (allOrders2.length !== 1) throw Error()

    const loginInfo2 = await ob.updateInfo()
    console.log('loginInfo2', loginInfo2)
    if (loginInfo2.freeFunds !== '0x0') throw Error()
    if (loginInfo2.ordersFunds !== '0x3b9aca00') throw Error()
    if (loginInfo2.lockedFunds !== '0x0') throw Error()

    const confirmOrder1 = await ob.confirmOrder(myOrders2[0], '0x3B9ACA00', '0x6789', walletSeed)
    console.log('confirmOrder1', confirmOrder1)
    await new Promise(resolve => setTimeout(resolve, 60000))

    const myOrders3 = await ob.getMyOrders()
    console.log('myOrders3', myOrders3)
    if (myOrders3.length !== 1) throw Error()
    if (myOrders3[0].confirmed !== true) throw Error()
    if (myOrders3[0].confirmatorSourceAddress !== '0x6789') throw Error()

    const allOrders3 = await ob.getOrders('TON CRYSTAL', 'USDT')
    console.log('allOrders3', allOrders3)
    if (allOrders3.length !== 0) throw Error()

    const loginInfo3 = await ob.updateInfo()
    console.log('loginInfo3', loginInfo3)
    if (loginInfo3.freeFunds !== '0x0') throw Error()
    if (loginInfo3.ordersFunds !== '0x0') throw Error()
    if (loginInfo3.lockedFunds !== '0x3b9aca00') throw Error()

    for (let i = 65; i > 0; i--) {
      await new Promise(resolve => setTimeout(resolve, 60000))
      console.log('wait remain (min)', i)
    }

    const finishOrder2 = await ob.finishOrderWithTimeout(myOrders3[0], walletSeed)
    console.log('finishOrder2', finishOrder2)
    await new Promise(resolve => setTimeout(resolve, 60000))

    const myOrders6 = await ob.getMyOrders()
    console.log('myOrders6', myOrders6)
    if (myOrders6.length !== 0) throw Error()

    const loginInfo6 = await ob.updateInfo()
    console.log('loginInfo6', loginInfo6)
    if (loginInfo6.freeFunds !== '0x3b9aca00') throw Error()
    if (loginInfo6.ordersFunds !== '0x0') throw Error()
    if (loginInfo6.lockedFunds !== '0x0') throw Error()

    console.log('STAGE 4: done')
  }

}

