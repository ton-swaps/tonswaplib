const TonSwapOrderbookAbi = require('./TonSwapOrderbookAbi');
const Wallet = require('./Wallet')
const { BigInteger } = require('javascript-biginteger');

class OrderWather {
  constructor(client, orderbook) {
    this.client = client
    this.orderbook = orderbook
    this.TON_TX_RETRY = 10*60
    this.id = undefined
  }

  async initId() {
    if (!this.id) {
      this.id = this.orderbook.bytesToHex(await this.orderbook.generateSecret())
    }
  }

  storageId () {
    return this.id
  }

  load (id) {
    const item = localStorage.getItem(id)
    if (!item) return
    const state = JSON.parse(item)
    this.state = state || undefined
    this.id = id
  }

  save () {
    if (!this.id) return
    localStorage.setItem(this.id, JSON.stringify(this.state))
    return this.id
  }

  getOrder() {
    return this.state
  }

  async createOrder(fromToken, toToken, rate, amount, minAmount, lockTime, initiatorAltAddress, address, seed) {
    console.log('createOrder', fromToken, toToken, rate, amount, minAmount, lockTime, initiatorAltAddress, address, seed)
    const swapDirect = fromToken === 'TON CRYSTAL'
    const swapId = swapDirect ? this.orderbook.directTable[toToken] : this.orderbook.reversedTable[fromToken]

    let secret = '0x0'
    if (swapDirect) {
      secret = '0x' + this.orderbook.hexAlign(this.orderbook.bytesToHex(await this.orderbook.generateSecret()), 64)
    }

    this.create(swapId, address, swapDirect, false, secret, undefined, address, initiatorAltAddress)
    this.seed = seed

    if (swapDirect && toToken === 'BTC') {
      const initiatorBtc = new this.orderbook.swappers.BTC.BtcSwapInitiator(undefined, undefined, initiatorAltAddress)
      initiatorAltAddress = initiatorBtc.swap.getPublicKey(initiatorAltAddress)
      // throw Error('Sorry, Bitcoin support coming soon')
    }

    try {
      const tx = await this.orderbook.createOrder (fromToken, toToken, rate, amount, minAmount, lockTime, initiatorAltAddress, secret, this.seed)
      this.state.tonCreateTxId = tx ? tx.transaction_id : undefined
      this.state.tonCreateTxTm = Math.floor(Date.now() / 1000)
    } catch (e) {
      console.log('createOrder error:', e)
      this.state.status = 'failed'
      this.save()
      throw e
    }

    this.watch()
    
    return true
  }

  async confirmOrder(order, amount, recipientAltAddress, address, seed) {
    console.log('confirmOrder', order, amount, recipientAltAddress, address, seed)

    let secret = '0x0'
    if (!order.direct) {
      secret = '0x' + this.orderbook.hexAlign(this.orderbook.bytesToHex(await this.orderbook.generateSecret()), 64)
    }

    this.create(order.swapId, order.id, order.direct, true, secret, order, address, recipientAltAddress)
    this.seed = seed

    if (order.direct && order.toToken === 'BTC') {
      const initiatorBtc = new this.orderbook.swappers.BTC.BtcSwapInitiator(undefined, undefined, recipientAltAddress)
      recipientAltAddress = initiatorBtc.swap.getPublicKey(recipientAltAddress)
      // throw Error('Sorry, Bitcoin support coming soon')
    }

    try {
      const tx = await this.orderbook.confirmOrder(order, amount, recipientAltAddress, secret, this.seed)
      this.state.tonConfirmTxId = tx ? tx.transaction_id : undefined
      this.state.tonConfirmTxTm = Math.floor(Date.now() / 1000)
    } catch (e) {
      console.log('confirmOrder error:', e)
      this.state.status = 'failed'
      this.save()
      throw e
    }

    this.watch()
    
    return true
  }

  /**
  swapId
  */
  create (swapId, id, direct, confirm, secret, order, address, altAddress) {
    this.state = {
      status: order !== undefined ? 'confirming' : 'initiated',
      swapId,
      id,
      address,
      direct,
      confirm,
      secret,
      order,
      altAddress,
      created: Math.floor(Date.now() / 1000),
    }
    this.save()
  }

  isActive () {
    if (this.state !== undefined) {
      return !(this.state.status === 'closed' || this.state.status === 'failed')
    } else {
      return false
    }
  }

  async watch () {
    while (this.isActive()) {

      let old_status = this.state.status
      let changed = false
      if (!this.state.confirm) {
        // state for order initiator
        if (this.state.direct) {
          switch(this.state.status) {
            case 'initiated':
              changed = await this.checkCreated()
              break
            case 'created':
              changed = await this.checkConfirm()
              break
            case 'confirmed':
              changed = await this.withdrawAltSecret()
              break
            case 'return':
              changed = await this.withdrawTonTimeout()
              break
          }
        } else {
          switch(this.state.status) {
            case 'initiated':
              changed = await this.checkCreated()
              break
            case 'created':
              changed = await this.checkConfirm()
              break
            case 'confirmed':
              changed = await this.createAltSwap()
              break
            case 'waitsecret':
              changed = await this.waitForSecret()
              break
            case 'withdrawTon':
              changed = await this.withdrawTonSecret()
              break
            case 'withdrawAlt':
              changed = await this.withdrawAltTimeout()
              break
          }
        }
      } else {
        // state for order confirmator
        if (this.state.direct) {
          switch(this.state.status) {
            case 'created':
            case 'confirming':
              changed = await this.checkConfirm()
              break
            case 'confirmed':
              changed = await this.createAltSwap()
              break
            case 'waitsecret':
              changed = await this.waitForSecret()
              break
            case 'withdrawTon':
              changed = await this.withdrawTonSecret()
              break
            case 'withdrawAlt':
              changed = await this.withdrawAltTimeout()
              break
          }
        } else {
          switch(this.state.status) {
            case 'created':
            case 'confirming':
              changed = await this.checkConfirm()
              break
            case 'confirmed':
              changed = await this.withdrawAltSecret()
              break
            case 'return':
              changed = await this.withdrawTonTimeout()
              break
          }
        }
      }
      if (changed) {
        console.log('Order state changed:', this.id, old_status + ' -> ' + this.state.status)
        this.save()
        continue
      }
      await new Promise(resolve => setTimeout(resolve, 20000))
    }
  }

  async checkCreated () {
    if (this.state.status !== 'initiated') {
      console.warn('checkCreated: Incorrect state:', this.state.status)
    }

    const tm = Math.floor(Date.now() / 1000)

    if (tm > this.state.created + 10*60) {
      this.state.status = 'failed'
      return true
    }

    try {
      let order
      if (this.state.direct) {
        order = await this.orderbook.getDirectOrder(this.state.swapId, this.state.id)
      } else {
        order = await this.orderbook.getReversedOrder(this.state.swapId, this.state.id)
      }
      if (order === undefined) {
        return false
      }
      this.state.order = order
      this.state.status = 'created'
      return true
    } catch (e) {
      console.log('checkCreated error:', e)
    }
    return false
  }

  async checkConfirm () {
    if (this.state.status !== 'created' && this.state.status !== 'confirming') {
      console.warn('checkConfirm: Incorrect state:', this.state.status)
    }

    try {
      let order
      if (this.state.direct) {
        order = await this.orderbook.getDirectOrder(this.state.swapId, this.state.id)
      } else {
        order = await this.orderbook.getReversedOrder(this.state.swapId, this.state.id)
      }
      if (order === undefined) {
        if (this.state.confirm) {
          this.state.status = 'failed'
        } else {
          this.state.status = 'closed'
        }
        console.log('order not found, go to', this.state.status)
        return true
      }
      if (!order.confirmed) {
        return false
      }
      if (order.direct) {
        if (this.state.confirm && order.confirmatorTargetAddress != this.state.address) {
          // confirmed, but not by us
          console.log('go to failed because', order.confirmatorTargetAddress, 'expected to be', this.state.address)
          this.state.status = 'failed'
          return true
        }
      } else {
        if (this.state.confirm && order.confirmatorSourceAddress != this.state.address) {
          // confirmed, but not by us
          console.log('go to failed because', order.confirmatorSourceAddress, 'expected to be', this.state.address)
          this.state.status = 'failed'
          return true
        }
      }

      this.state.order = order

      this.state.confirmedTm = BigInteger(order.confirmTime).toJSValue()
      this.state.altCreateUntil = BigInteger(order.confirmTime).toJSValue() + BigInteger(order.timeLockSlot).toJSValue()
      this.state.altWithdrawUntil = BigInteger(order.confirmTime).toJSValue() + 2*BigInteger(order.timeLockSlot).toJSValue()
      this.state.tonWithdrawUntil = BigInteger(order.confirmTime).toJSValue() + 3*BigInteger(order.timeLockSlot).toJSValue()
      this.state.status = 'confirmed'
      console.log('found confirmed order, go to', this.state.status)
      return true
    } catch (e) {
      console.log('checkConfirm error:', e)
    }
    return false
  }

  async withdrawAltSecret () {
    if (this.state.status !== 'confirmed') {
      console.warn('withdrawAltSecret: Incorrect state:', this.state.status)
    }

    const tm = Math.floor(Date.now() / 1000)

    if (tm > this.state.altWithdrawUntil - 60*15) {
      this.state.status = 'return'
      return true
    }

    const altToken = this.state.order.direct ? this.state.order.toToken : this.state.order.fromToken
    // check alt swap exists
    // check params
    const altValue = await this.orderbook.getAltValue(this.state.order.value, this.state.order.exchangeRate)
    if (altValue === undefined) {
      this.state.status = 'return'
      return true
    }
    const secretHash = this.state.order.secretHash
    const timeLockUntil = BigInteger(this.state.order.confirmTime).toJSValue() + 2*BigInteger(this.state.order.timeLockSlot).toJSValue()

    let sourceAddr
    let dstAddress
    if (this.state.direct) {
      sourceAddr = this.state.order.confirmatorSourceAddress
      dstAddress = this.state.order.initiatorTargetAddress
    } else {
      sourceAddr = this.state.order.initiatorSourceAddress
      dstAddress = this.state.order.confirmatorTargetAddress
    }

    try {
      
      console.log('Start ' +  altToken + ' check & withdraw with secret',
        this.state.secret, 'srcAddress', sourceAddr, 'dstAddress', dstAddress, 'altValue', altValue,
        'secretHash', secretHash, 'until', timeLockUntil) 

      if (altToken === 'ETH') {
        sourceAddr = '0x' + this.orderbook.hexAlign(BigInteger(sourceAddr, 16).toString(16), 40)
        dstAddress = '0x' + this.orderbook.hexAlign(BigInteger(dstAddress, 16).toString(16), 40)
        if (this.receiverEth === undefined) {
          this.receiverEth = new this.orderbook.swappers.ETH.EthSwapReceiver(sourceAddr, dstAddress, this.state.secret, secretHash)
        }
        const res = await this.receiverEth.getSwap()
        const balance = '0x' + BigInteger(res.balance, 10).toString(16)
        const targetWallet = res.targetWallet
        const createdAt = BigInteger(res.targetWallet, 10)
        const secretHash2 = res.secretHash
        /*
        balance: "100000000000000000"
        createdAt: "1600357932"
        secret: "0x0000000000000000000000000000000000000000000000000000000000000000"
        secretHash: "0xf2216218205d7137b1d0ddae39d42ab5f0131e2c90ad1ff8beab9ef6c1f9aa0b"
        targetWallet: "0x16eb4854Af105caC0347507115946D6024A3B575"
        */
        if (BigInteger(dstAddress).compare(targetWallet) !== 0) {
          console.log('invalid dstAddress, got', targetWallet, 'expected', dstAddress)
          return false
        }
        if (BigInteger(secretHash).compare(secretHash2) !== 0) {
          console.log('invalid secretHash, got', secretHash2, 'expected', secretHash)
          return false
        }
        if (BigInteger(balance).compare(altValue) !== 0) {
          console.log('invalid amount, got', balance, 'expected', altValue)
          return false
        }
        // TODO rewrite smc
        if (tm > createdAt + 3600 - 60*20 || createdAt + 3600 < this.state.altWithdrawUntil) {
          console.log('have no time', createdAt, 'now', tm)
          return false
        }

        this.state.altFinishTxId = await this.receiverEth.withdraw()
        this.state.altFinishTxTm = Math.floor(Date.now() / 1000)
        this.state.status = 'return'
        return true
      } else if (altToken === 'USDT') {
        sourceAddr = '0x' + this.orderbook.hexAlign(BigInteger(sourceAddr, 16).toString(16), 40)
        dstAddress = '0x' + this.orderbook.hexAlign(BigInteger(dstAddress, 16).toString(16), 40)
        if (this.receiverEth === undefined) {
          this.receiverEth = new this.orderbook.swappers.USDT.EthTokenSwapReceiver('USDT', sourceAddr, dstAddress, this.state.secret, secretHash)
        }
        const res = await this.receiverEth.getSwap()
        const balance = '0x' + BigInteger(res.balance, 10).toString(16)
        const targetWallet = res.targetWallet
        const createdAt = BigInteger(res.targetWallet, 10)
        const secretHash2 = res.secretHash
        const tokenAddress = this.receiverEth.tokenAddress
        const tokenAddress2 = res.token
        /*
        address token;
        address payable targetWallet;
        bytes32 secret;
        bytes32 secretHash;
        uint256 createdAt;
        uint256 balance;
        balance: "2000000"
        createdAt: "1600412628"
        secret: "0x0000000000000000000000000000000000000000000000000000000000000000"
        secretHash: "0xdd896b7ed3f7030e8c5f274e99b1226248a3edbe277cc4874d95662e2b329d45"
        targetWallet: "0xe5f178488DB8a528915aBA104aBaad69977Ce3b6"
        token: "0x5070C3eD94bF90868aF26b84cc6876a4137D9ECF"
        */
        if (BigInteger(dstAddress).compare(targetWallet) !== 0) {
          console.log('invalid dstAddress, got', targetWallet, 'expected', dstAddress)
          return false
        }
        if (BigInteger(secretHash).compare(secretHash2) !== 0) {
          console.log('invalid secretHash, got', secretHash2, 'expected', secretHash)
          return false
        }
        if (BigInteger(balance).compare(altValue) !== 0) {
          console.log('invalid amount, got', balance, 'expected', altValue)
          return false
        }
        if (BigInteger(tokenAddress).compare(tokenAddress2) !== 0) {
          console.log('invalid token, got', tokenAddress2, 'expected', tokenAddress)
          return false
        }
        // TODO rewrite smc
        if (tm > createdAt + 3600 - 60*20 || createdAt + 3600 < this.state.altWithdrawUntil) {
          console.log('have no time', createdAt, 'now', tm)
          return false
        }

        this.state.altFinishTxId = await this.receiverEth.withdraw()
        this.state.altFinishTxTm = Math.floor(Date.now() / 1000)
        this.state.status = 'return'
        return true
      } else if (altToken === 'BTC') {
        sourceAddr = '0x' + this.orderbook.hexAlign(sourceAddr, 66)
        dstAddress = '0x' + this.orderbook.hexAlign(dstAddress, 66)
        if (this.receiverBtc === undefined) {
          this.receiverBtc = new this.orderbook.swappers.BTC.BtcSwapReceiver(sourceAddr, dstAddress, this.state.altAddress, this.state.secret, secretHash)
        }
        const res = await this.receiverBtc.getSwap(BigInteger(altValue).toJSValue(), this.state.altWithdrawUntil)

        if (res) {
          console.log('btc swap contract not found')
          return false
        }

        let withdrawTx;
        try {
          withdrawTx = await this.receiverBtc.withdraw(BigInteger(altValue).toJSValue(), this.state.altWithdrawUntil, this.state.secret)
        } catch (e) {
          console.log('withdraw error:', e)
        }
        if (!withdrawTx) {
          return false
        }

        this.state.altFinishTxId = withdrawTx
        this.state.altFinishTxTm = Math.floor(Date.now() / 1000)
        this.state.status = 'return'
        return true
      }

    } catch (e) {
      console.log('withdrawAltSecret error:', e)
    }

    return false
  }

  async createAltSwap () {
    if (this.state.status !== 'confirmed') {
      console.warn('createAltSwap: Incorrect state:', this.state.status)
    }

    const tm = Math.floor(Date.now() / 1000)

    if (tm > this.state.altCreateUntil - 60*15) {
      this.state.status = 'failed'
      return true
    }

    const altToken = this.state.order.direct ? this.state.order.toToken : this.state.order.fromToken

    // create alt swap
    const altValue = await this.orderbook.getAltValue(this.state.order.value, this.state.order.exchangeRate)
    if (altValue === undefined) {
      this.state.status = 'failed'
      return true
    }
    const secretHash = this.state.order.secretHash
    const timeLockUntil = BigInteger(this.state.order.confirmTime).toJSValue() + 2*BigInteger(this.state.order.timeLockSlot).toJSValue()

    let sourceAddr
    let dstAddress
    if (this.state.direct) {
      sourceAddr = this.state.order.confirmatorSourceAddress
      dstAddress = this.state.order.initiatorTargetAddress
    } else {
      sourceAddr = this.state.order.initiatorSourceAddress
      dstAddress = this.state.order.confirmatorTargetAddress
    }
    // validate addresses

    try {

      console.log('Start ' +  altToken + ' swap init with secret hash',
        secretHash, 'srcAddress', sourceAddr, 'dstAddress', dstAddress, 'altValue', altValue, 'until', timeLockUntil) 
      
      if (altToken === 'ETH') {
        sourceAddr = '0x' + this.orderbook.hexAlign(BigInteger(sourceAddr, 16).toString(16), 40)
        dstAddress = '0x' + this.orderbook.hexAlign(BigInteger(dstAddress, 16).toString(16), 40)
        if (this.initiatorEth === undefined) {
          this.initiatorEth = new this.orderbook.swappers.ETH.EthSwapInitiator(sourceAddr, dstAddress, secretHash)
        }
        this.state.altTxId = await this.initiatorEth.create(altValue)
        this.state.altTxTm = Math.floor(Date.now() / 1000)

        this.state.status = 'waitsecret'
        return true
      } else if (altToken === 'USDT') {
        sourceAddr = '0x' + this.orderbook.hexAlign(BigInteger(sourceAddr, 16).toString(16), 40)
        dstAddress = '0x' + this.orderbook.hexAlign(BigInteger(dstAddress, 16).toString(16), 40)
        if (this.initiatorEth === undefined) {
          this.initiatorEth = new this.orderbook.swappers.USDT.EthTokenSwapInitiator('USDT', sourceAddr, dstAddress, secretHash)
        }
        if (this.state.altApproveTxId === undefined) {
          this.state.altApproveTxId = await this.initiatorEth.approve(altValue)
          this.state.altApproveTxTm = Math.floor(Date.now() / 1000)
          return true
        } else {
          const amount = await this.initiatorEth.checkApprove()
          if (BigInteger(amount).compare(altValue) !== 0) {
            console.log('Approve', amount, 'expected', altValue)
            return false
          }
        }
        this.state.altTxId = await this.initiatorEth.create(altValue)
        this.state.altTxTm = Math.floor(Date.now() / 1000)

        this.state.status = 'waitsecret'
        return true
      } else if (altToken === 'BTC') {
        sourceAddr = '0x' + this.orderbook.hexAlign(sourceAddr, 66)
        dstAddress = '0x' + this.orderbook.hexAlign(dstAddress, 66)
        if (this.initiatorBtc === undefined) {
          this.initiatorBtc = new this.orderbook.swappers.BTC.BtcSwapInitiator(sourceAddr, dstAddress, this.state.altAddress, secretHash)
        }
        this.state.altTxId = await this.initiatorBtc.create(BigInteger(altValue).toJSValue(), this.state.altWithdrawUntil)
        this.state.altTxTm = Math.floor(Date.now() / 1000)

        for (let i = 0; i < 10; i++) {
          console.log('check swap tx')
          const res = await his.initiatorBtc.checkTX(this.state.altTxId)
          if (res) {
            console.log('found swap tx')
            break
          }

          await new Promise(resolve => setTimeout(resolve, 10000))
        }

        this.state.status = 'waitsecret'
        return true
      }

      return false
    } catch (e) {
      console.log('createAltSwap error:', e)
      return false
    }

    return false
  }

  async waitForSecret() {
    if (this.state.status !== 'waitsecret') {
      console.warn('waitForSecret: Incorrect state', this.state.status)
    }

    const tm = Math.floor(Date.now() / 1000)

    if (tm > this.state.altWithdrawUntil + 60) {
      this.state.status = 'withdrawAlt'
      return true
    }

    const altToken = this.state.order.direct ? this.state.order.toToken : this.state.order.fromToken

    const secretHash = this.state.order.secretHash

    let sourceAddr
    let dstAddress
    if (this.state.direct) {
      sourceAddr = this.state.order.confirmatorSourceAddress
      dstAddress = this.state.order.initiatorTargetAddress
    } else {
      sourceAddr = this.state.order.initiatorSourceAddress
      dstAddress = this.state.order.confirmatorTargetAddress
    }

    try {

      // get alt swap state
      //
      console.log('Start request secret from ', altToken, 'srcAddress', sourceAddr, 'dstAddress', dstAddress,
        'secretHash', secretHash)

      if (altToken === 'ETH') {
        sourceAddr = '0x' + this.orderbook.hexAlign(BigInteger(sourceAddr, 16).toString(16), 40)
        dstAddress = '0x' + this.orderbook.hexAlign(BigInteger(dstAddress, 16).toString(16), 40)
        if (this.initiatorEth === undefined) {
          this.initiatorEth = new this.orderbook.swappers.ETH.EthSwapInitiator(sourceAddr, dstAddress, secretHash)
        }

        const res = await this.initiatorEth.getSwap()
        if (res === undefined) {
          return false
        }
        const secret = res.secret

        // "0x0000000000000000000000000000000000000000000000000000000000000000"

        if (secret === undefined || secret === null ||
          secret === '' || BigInteger(secret).compare(0) === 0) {
          return false
        }
        this.state.secret = secret.toLowerCase()
        this.state.status = 'withdrawTon'
        return true
      } else if (altToken === 'USDT') {
        sourceAddr = '0x' + this.orderbook.hexAlign(BigInteger(sourceAddr, 16).toString(16), 40)
        dstAddress = '0x' + this.orderbook.hexAlign(BigInteger(dstAddress, 16).toString(16), 40)
        if (this.initiatorEth === undefined) {
          this.initiatorEth = new this.orderbook.swappers.USDT.EthTokenSwapInitiator('USDT', sourceAddr, dstAddress, secretHash)
        }

        const res = await this.initiatorEth.getSwap()
        if (res === undefined) {
          return false
        }
        const secret = res.secret

        // "0x0000000000000000000000000000000000000000000000000000000000000000"

        if (secret === undefined || secret === null ||
          secret === '' || BigInteger(secret).compare(0) === 0) {
          return false
        }
        this.state.secret = secret.toLowerCase()
        this.state.status = 'withdrawTon'
        return true
      } else if (altToken === 'BTC') {
        sourceAddr = '0x' + this.orderbook.hexAlign(sourceAddr, 66)
        dstAddress = '0x' + this.orderbook.hexAlign(dstAddress, 66)
        if (this.initiatorEth === undefined) {
          this.initiatorBtc = new this.orderbook.swappers.BTC.BtcSwapInitiator(sourceAddr, dstAddress, this.state.altAddress, secretHash)
        }

        let extractedSecret;
        try {
          extractedSecret = await this.initiatorBtc.getSwap(this.state.altWithdrawUntil)
        } catch (e) {
          console.log('getsecret error:', e)
        }

        if (extractedSecret === undefined) {
          return false
        }
        const secret = extractedSecret

        // "0x0000000000000000000000000000000000000000000000000000000000000000"

        if (secret === undefined || secret === null ||
          secret === '' || BigInteger(secret).compare(0) === 0) {
          return false
        }
        this.state.secret = secret.toLowerCase()
        this.state.status = 'withdrawTon'
        return true
      }

      return false
    } catch (e) {
      console.log('waitForSecret error:', e)
    }

    
    return false
  }

  async withdrawAltTimeout() {
    if (this.state.status !== 'withdrawAlt') {
      console.warn('withdrawAltTimeout: Incorrect state', this.state.status)
    }
    const tm = Math.floor(Date.now() / 1000)
    
    const altToken = this.state.order.direct ? this.state.order.toToken : this.state.order.fromToken

    const altValue = await this.orderbook.getAltValue(this.state.order.value, this.state.order.exchangeRate)
    if (altValue === undefined) {
      this.state.status = 'failed'
      return true
    }
    const secretHash = this.state.order.secretHash

    let sourceAddr
    let dstAddress
    if (this.state.direct) {
      sourceAddr = this.state.order.confirmatorSourceAddress
      dstAddress = this.state.order.initiatorTargetAddress
    } else {
      sourceAddr = this.state.order.initiatorSourceAddress
      dstAddress = this.state.order.confirmatorTargetAddress
    }

    if (this.state.altFinishTxId === undefined) {
      try {

        console.log('Start withdraw timeout from ', altToken, 'srcAddress', sourceAddr, 'dstAddress', dstAddress,
        'secretHash', secretHash, 'lockUntil', this.state.altWithdrawUntil, 'now', tm)

        if (altToken === 'ETH') {
          sourceAddr = '0x' + this.orderbook.hexAlign(BigInteger(sourceAddr, 16).toString(16), 40)
          dstAddress = '0x' + this.orderbook.hexAlign(BigInteger(dstAddress, 16).toString(16), 40)
          if (this.initiatorEth === undefined) {
            this.initiatorEth = new this.orderbook.swappers.ETH.EthSwapInitiator(sourceAddr, dstAddress, secretHash)
          }
          const tx = await this.initiatorEth.withdrawWithTimeout()

          if (tx !== undefined) {
            this.state.altFinishTxId = tx
            this.state.altFinishTxTm = Math.floor(Date.now() / 1000)
            // this.state.status = 'withdrawTon'
            return true
          }
        } else if (altToken === 'USDT') {
          sourceAddr = '0x' + this.orderbook.hexAlign(BigInteger(sourceAddr, 16).toString(16), 40)
          dstAddress = '0x' + this.orderbook.hexAlign(BigInteger(dstAddress, 16).toString(16), 40)
          if (this.initiatorEth === undefined) {
            this.initiatorEth = new this.orderbook.swappers.USDT.EthTokenSwapInitiator('USDT', sourceAddr, dstAddress, secretHash)
          }
          const tx = await this.initiatorEth.withdrawWithTimeout()

          if (tx !== undefined) {
            this.state.altFinishTxId = tx
            this.state.altFinishTxTm = Math.floor(Date.now() / 1000)
            return true
          }
        } else if (altToken === 'BTC') {
          sourceAddr = '0x' + this.orderbook.hexAlign(sourceAddr, 66)
          dstAddress = '0x' + this.orderbook.hexAlign(dstAddress, 66)
          if (this.initiatorEth === undefined) {
            this.initiatorBtc = new this.orderbook.swappers.BTC.BtcSwapInitiator(sourceAddr, dstAddress, this.state.altAddress, secretHash)
          }
          const tx = await this.initiatorBtc.withdrawWithTimeout(BigInteger(altValue).toJSValue(), this.state.altWithdrawUntil)

          if (tx !== undefined) {
            this.state.altFinishTxId = tx
            this.state.altFinishTxTm = Math.floor(Date.now() / 1000)
            return true
          }
        }

        return false

      } catch (e) {
        console.log('withdrawAltTimeout error:', e)
      }
    }

    try {

      // get alt swap state
      console.log('Start request state from ', altToken, 'srcAddress', sourceAddr, 'dstAddress', dstAddress,
        'secretHash', secretHash)
      let secret = undefined

      if (altToken === 'ETH') {
        // const secret = await this.initiatorEth.waitForSecret()
        if (this.initiatorEth === undefined) {
          this.initiatorEth = new this.orderbook.swappers.ETH.EthSwapInitiator(sourceAddr, dstAddress, secretHash)
        }
        const res = await this.initiatorEth.getSwap()

        if (res === undefined) {
          return false
        }
        const secret = res.secret
        const balance = BigInteger(res.balance, 10)
        if (balance.compare(0) === 0) {
          // withdrawn
          this.state.status = 'failed'
          return true
        }

        if (secret === undefined || secret === null ||
          secret === '' || BigInteger(secret).compare(0) === 0) {
          return false
        }

        this.state.secret = secret.toLowerCase()
        this.state.status = 'withdrawTon'
        return true
      }
    } catch (e) {
      console.log('withdrawAltTimeout error:', e)
    }

    return false
  }


  async withdrawTonSecret () {
    if (this.state.status !== 'withdrawTon') {
      console.warn('withdrawTonSecret: Incorrect state', this.state.status)
    }

    const tm = Math.floor(Date.now() / 1000)

    if (this.state.tonFinishTxId === undefined || tm > this.state.tonFinishTxTm + this.TON_TX_RETRY) {
      try {
        const tx = await this.orderbook.finishOrderWithSecret(this.state.order, this.state.secret, this.seed)
        this.state.tonFinishTxId = tx ? tx.transaction_id : undefined
        this.state.tonFinishTxTm = Math.floor(Date.now() / 1000)
        return true
      } catch (e) {
        console.log('finishOrderWithSecret error:', e)
      }
    }

    try {
      let order
      if (this.state.direct) {
        order = await this.orderbook.getDirectOrder(this.state.swapId, this.state.id)
      } else {
        order = await this.orderbook.getReversedOrder(this.state.swapId, this.state.id)
      }
      if (order === undefined) {
        this.state.status = 'closed'
        return true
      }
    } catch (e) {
      console.log('withdrawTonSecret error:', e)
    }

    return false
  }


  async withdrawTonTimeout () {
    if (this.state.status !== 'return') {
      console.warn('withdrawTonTimeout: Incorrect state', this.state.status)
    }

    const tm = Math.floor(Date.now() / 1000)

    if (tm > this.state.tonWithdrawUntil + 60) {

      if (this.state.tonFinishTxId === undefined || tm > this.state.tonFinishTxTm + this.TON_TX_RETRY) {
        try {
          const tx = await this.orderbook.finishOrderWithTimeout(this.state.order, this.seed)
          this.state.tonFinishTxId = tx ? tx.transaction_id : undefined
          this.state.tonFinishTxTm = Math.floor(Date.now() / 1000)
          return true
        } catch (e) {
          console.log('finishOrderWithTimeout error:', e)
        }
      }

    }

    try {
      let order
      if (this.state.direct) {
        order = await this.orderbook.getDirectOrder(this.state.swapId, this.state.id)
      } else {
        order = await this.orderbook.getReversedOrder(this.state.swapId, this.state.id)
      }
      if (order === undefined) {
        this.state.status = 'closed'
        return true
      }
    } catch (e) {
      console.log('getOrder error:', e)
    }

    return false
  }

}

class OrdersWatcher {
  constructor(client, orderbook) {
    this.client = client
    this.orderbook = orderbook
    this.orders = []
    this.inited = false
  }

  isInited() {
    return this.inited
  }

  init(address, seed) {
    this.address = address
    this.seed = seed
    this.loadAll()
    this.inited = true
  }

  loadAll () {
    let list = localStorage.getItem('orderList_' + this.address)
    if (!list) {
      return
    }
    list = JSON.parse(list)
    for (let i in list) {
      let order = new OrderWather(this.client, this.orderbook)
      order.load(list[i])
      if (order.state === undefined)
        continue
      if (order.isActive()) {
        order.seed = this.seed
        order.watch()
      }
      this.orders.push(order)
    }
  }

  saveAll () {
    let list = []
    for (let i in this.orders) {
      let order = this.orders[i]
      if (order.storageId())
        list.push(order.storageId())
    }
    localStorage.setItem('orderList_' + this.address, JSON.stringify(list))
  }

  async newOrder() {
    const order = new OrderWather(this.client, this.orderbook)
    await order.initId()
    this.orders.push(order)
    this.saveAll()
    return order
  }

  isAnyActive() {
    for (let i in this.orders) {
      let order = this.orders[i]
      if (order.isActive()) {
        return true
      }
    }
    return false
  }

  getOrders() {
    let list = []
    for (let i in this.orders) {
      let order = this.orders[i]
      list.push(order.getOrder())
    }
    return list
  }
}

module.exports = OrdersWatcher