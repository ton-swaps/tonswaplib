const { TONClient, setWasmOptions } = require('ton-client-web-js')
const TonSwapOrderbookAbi = require('./TonSwapOrderbookAbi');
const Wallet = require('./Wallet');
const { BigInteger } = require('javascript-biginteger');
const OrdersWatcher = require('./OrdersWatcher');
const eth = require('./eth');
const ethtoken = require('./ethtoken');
const btc = require('./btc');

function debug(message) {
  console.log(message)
}

const to_hex_array = [];
const to_byte_map = {};
for (let ord = 0; ord <= 0xff; ord++) {
    let s = ord.toString(16);
    if (s.length < 2) {
        s = "0" + s;
    }
    to_hex_array.push(s);
    to_byte_map[s] = ord;
}

class TonSwapOrderbook {
  constructor (smcAddress, network=['net.ton.dev']) {
    // ['main.ton.dev']
    this.inited = false
    this.network = network
    this.smcAddress = smcAddress
    this.abi = TonSwapOrderbookAbi
    this.swappers = {
      ETH: eth,
      USDT: ethtoken,
      BTC: btc
    }
    // this.swappers.ETH.ethInit()
    this.swappers.ETH.ethEnabled()

    this.translate = {
      'TON CRYSTAL': 'Free TON',
      ETH: 'Ethereum',
      USDT: 'Ethereum',
      BTC: 'Bitcoin'
    }
    this.TRANSACTION_VALUE = 1000000000 // 1 TON CRYSTAL

    this.SWAP_DIRECT_TON_ETH = 0;
    this.SWAP_DIRECT_TON_USDT = 1;
    this.SWAP_DIRECT_TON_BTC = 2;
    this.directTable = {
      0: ['TON CRYSTAL', 'ETH'],
      1: ['TON CRYSTAL', 'USDT'],
      2: ['TON CRYSTAL', 'BTC'],
      'ETH': 0,
      'USDT': 1,
      'BTC': 2
    }
    this.SWAP_REVERSED_ETH_TON = 0;
    this.SWAP_REVERSED_USDT_TON = 1;
    this.SWAP_REVERSED_BTC_TON = 2;
    this.reversedTable = {
      0: ['ETH', 'TON CRYSTAL'],
      1: ['USDT', 'TON CRYSTAL'],
      2: ['BTC', 'TON CRYSTAL'],
      'ETH': 0,
      'USDT': 1,
      'BTC': 2
    }
    this.BigInteger = BigInteger
  }

  async init() {
    setWasmOptions({
      debug,
    });
    this.client = await TONClient.create({
        servers: this.network
    });
    this.ordersWatcher = new OrdersWatcher(this.client, this)
    this.inited = true
  }

  isInited () {
    return this.inited
  }

  getAddress () {
    return this.smcAddress
  }

  translateToken (token) {
    return this.translate[token]
  }


  bytesToHex(buffer) {
    const hex_array = []
    for (let i = 0; i < buffer.byteLength; i++) {
        hex_array.push(to_hex_array[buffer[i]])
    }
    return hex_array.join("")
  }

  
  bytesToHexString(buffer) {
    const hex_array = []
    for (let i = 0; i < buffer.byteLength; i++) {
        hex_array.push('\\x' + to_hex_array[buffer[i]])
    }
    return hex_array.join("")
  }

  hexToBytes(s) {
    s = s.toLowerCase()
    const length2 = s.length
    if (length2 % 2 !== 0) {
        throw Error("hex string must have length a multiple of 2");
    }
    const length = length2 / 2
    const result = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
        const i2 = i * 2
        const b = s.substring(i2, i2 + 2)
        result[i] = to_byte_map[b]
    }
    return result;
  }

  hexAlign(value, digits) {
    value = value.replace('0x', '')
    for (let i = digits - value.length; i > 0; i--) {
      value = '0' + value
    }
    return value
  }

  async sha256 (bytes) {
    if (typeof window !== 'undefined') {
      if (typeof bytes === 'string') {
        bytes = this.hexToBytes(bytes.replace('0x', ''))
      }
      const hash = await crypto.subtle.digest("SHA-256", bytes)
      console.log('hash', hash)
      return '0x' + this.bytesToHex(new Uint8Array(hash))
    }
  }

  async generateSecret () {
    const keys = await this.client.crypto.ed25519Keypair()
    return this.hexToBytes(keys.secret)
  }

  async _createInternalMessage (functionName, input={}) {
    console.log('_createInternalMessage');
    console.log('abi', this.abi);
    console.log('functionName', functionName);
    console.log('input', input);
    const res = await this.client.contracts.createRunBody({
      abi: this.abi,
      function: functionName,
      header: undefined,
      params: input,
      internal: true,
      keyPair: undefined,
      signingBox: undefined
    });
    console.log('output', res);
    return res.bodyBase64;
  }

  async _runSmcMethod (value, functionName, input={}) {
    console.log('_runSmcMethod');
    console.log('value', value);
    console.log('functionName', functionName);
    console.log('input', input);

    if (!this.wallet) throw Error('Not logged')

    const msg = await this._createInternalMessage(functionName, input)
    
    const res = await this.wallet.transact(value, 
                                    this.getAddress(),
                                    msg)
    
    console.log('output', res);
    return res;
  }

  async _runGetMethod (functionName, input={}) {
    console.log('_runGetMethod');
    console.log('functionName', functionName);
    console.log('input', input);
    const res = await this.client.contracts.runLocal({
      address: this.smcAddress,
      abi: this.abi,
      functionName,
      fullRun: false,
      input: input
    });
    console.log('output', res);
    return res.output;
  }

  async getAltValue (value, rate) {
    console.log('getAltValue:', value, rate)
    try {
      const res = await this._runGetMethod ('calcForeignOutput', {
          value: value,
          exchangeRate: rate
        })
      return res.foreignValue
    } catch (e) {
      console.log('getAltValue error:', e)
    }
    return undefined
  }

  async login (address, seed) {
    const wallet = new Wallet(this.client)
    await wallet.login(address, seed)
    this.wallet = wallet
  }

  logout () {
    this.wallet = undefined
  }

  /**
   * 
   * @param {number} value Value in TON CRYSTALS 
   * @param {*} seed Seed phrase
   */
  async deposit (value, seed) {
    if (!this.wallet) throw Error('Not logged')
    if (seed !== this.wallet.seed) throw Error('Invalid seed phrase')

    value = BigInteger(value)
    value = value.add(this.TRANSACTION_VALUE)

    const res = await this.wallet.transact('0x' + value.toString(16), this.getAddress())
    console.log('deposit', res)

    return res;
  }

  /**
   * 
   * @param {number} value Value in TON CRYSTALS 
   * @param {*} seed Seed phrase
   */
  async withdraw (value, seed) {
    if (!this.wallet) throw Error('Not logged')
    if (seed !== this.wallet.seed) throw Error('Invalid seed phrase')

    value = BigInteger(value)

    const res = await this._runSmcMethod(this.TRANSACTION_VALUE,
                            'withdraw',
                            {
                              amount: '0x' + value.toString(16)
                            })

    return res
  }

  async updateInfo () {
    if (!this.wallet) throw Error('Not logged')

    const res = await this._runGetMethod('getBalance', {'participant': this.wallet.getAddress()})
    const out = {
      freeFunds: res.balance.value,
      ordersFunds: res.balance.inOrders,
      lockedFunds: res.balance.locked
    }
    return out
  }

  /**
   * 
   * @param {number} swapId SWAP_DIRECT_*
   * @param {string} initiatorAddress order initiator address
   */
  async getDirectOrder(swapId, initiatorAddress) {
    const res = await this._runGetMethod('getDirectOrder',
                                        {
                                          'dbId': swapId,
                                          'initiatorAddress': initiatorAddress
                                        })
    if (res.order.value === '0x0') {
      return undefined
    }
    res.order.id = initiatorAddress
    res.order.swapId = swapId
    res.order.direct = true
    res.order.fromToken = this.directTable[swapId][0]
    res.order.toToken = this.directTable[swapId][1]
    res.order.secretHash = '0x' + this.hexAlign(res.order.secretHash, 64)
    res.order.initiatorTargetAddress = '0x' + this.hexAlign(res.order.initiatorTargetAddress, 66)
    res.order.confirmatorSourceAddress = '0x' + this.hexAlign(res.order.confirmatorSourceAddress, 66)
    return res.order
  }

  /**
   * 
   * @param {number} swapId SWAP_REVERSED_*
   * @param {string} initiatorAddress order initiator address
   */
  async getReversedOrder(swapId, initiatorAddress) {
    const res = await this._runGetMethod('getReversedOrder',
                                        {
                                          'dbId': swapId,
                                          'initiatorAddress': initiatorAddress
                                        })
    if (res.order.foreignValue === '0x0') {
      return undefined
    }
    res.order.id = initiatorAddress
    res.order.swapId = swapId
    res.order.direct = false
    res.order.fromToken = this.reversedTable[swapId][0]
    res.order.toToken = this.reversedTable[swapId][1]
    res.order.secretHash = '0x' + this.hexAlign(res.order.secretHash, 64)
    res.order.initiatorSourceAddress = '0x' + this.hexAlign(res.order.initiatorSourceAddress, 66)
    res.order.confirmatorTargetAddress = '0x' + this.hexAlign(res.order.confirmatorTargetAddress, 66)
    return res.order
  }

  async getDirectOrders(swapId) {
    const res = await this._runGetMethod('getDirectOrders',
                                        {
                                          'dbId': swapId
                                        })
    let orders = []
    for (let i in res.orders) {
      const order = await this.getDirectOrder(swapId, res.orders[i])
      if (order) {
        orders.push(order)
      }
    }
    return orders
  }

  async getReversedOrders(swapId) {
    const res = await this._runGetMethod('getReversedOrders',
                                        {
                                          'dbId': swapId
                                        })
    let orders = []
    for (let i in res.orders) {
      const order = await this.getReversedOrder(swapId, res.orders[i])
      if (order) {
        orders.push(order)
      }
    }
    return orders
  }

  async getMyOrders () {
    if (!this.wallet) throw Error('Not logged')
    let orders = []
    let res;
    res = await this.getDirectOrder(this.SWAP_DIRECT_TON_USDT, this.wallet.getAddress())
    if (res) orders.push(res)
    res = await this.getDirectOrder(this.SWAP_DIRECT_TON_ETH, this.wallet.getAddress())
    if (res) orders.push(res)
    res = await this.getDirectOrder(this.SWAP_DIRECT_TON_BTC, this.wallet.getAddress())
    if (res) orders.push(res)
    res = await this.getReversedOrder(this.SWAP_REVERSED_USDT_TON, this.wallet.getAddress())
    if (res) orders.push(res)
    res = await this.getReversedOrder(this.SWAP_REVERSED_ETH_TON, this.wallet.getAddress())
    if (res) orders.push(res)
    res = await this.getReversedOrder(this.SWAP_REVERSED_BTC_TON, this.wallet.getAddress())
    if (res) orders.push(res)
    return orders
  }

  /*

   */
  async createOrder (fromToken, toToken, rate, amount, minAmount, lockTime, initiatorAltAddress, secret, seed, checks=true) {
    console.log('createOrder', rate, amount, minAmount, lockTime, initiatorAltAddress, seed)
    const swapDirect = fromToken === 'TON CRYSTAL'
    const swapId = swapDirect ? this.directTable[toToken] : this.reversedTable[fromToken]

    if (checks) {
      let order
      // update order info
      if (swapDirect) {
        order = await this.getDirectOrder(swapId, this.wallet.getAddress())
      } else {
        order = await this.getReversedOrder(swapId, this.wallet.getAddress())
      }
      if (order) throw Error('Order already exists')
    }

    if (!this.wallet) throw Error('Not logged')
    if (seed !== this.wallet.seed) throw Error('Invalid seed phrase')

    if (swapDirect) {

      let value = BigInteger(amount)
      let minValue = BigInteger(minAmount)
      let exchangeRate = BigInteger(rate)
      let secretHash = '0x' + this.hexAlign(await this.sha256(secret), 64)
      let initiatorTargetAddress = this.hexAlign(initiatorAltAddress, 66)

      return await this._runSmcMethod(this.TRANSACTION_VALUE,
                            'createDirectOrder',
                            {
                              dbId: swapId,
				                      value: '0x' + value.toString(16),
				                      minValue: '0x' + minValue.toString(16),
				                      exchangeRate: '0x' + exchangeRate.toString(16),
				                      timeLockSlot: lockTime,
				                      secretHash: secretHash,
				                      initiatorTargetAddress: initiatorTargetAddress
                            })

    } else {

      let value = BigInteger(amount)
      let minValue = BigInteger(minAmount)
      let exchangeRate = BigInteger(rate)
      let initiatorSourceAddress = this.hexAlign(initiatorAltAddress, 66)

      return await this._runSmcMethod(this.TRANSACTION_VALUE,
                            'createReversedOrder',
                            {
                              dbId: swapId,
				                      value: '0x' + value.toString(16),
				                      minValue: '0x' + minValue.toString(16),
				                      exchangeRate: '0x' + exchangeRate.toString(16),
				                      timeLockSlot: lockTime,
				                      initiatorSourceAddress: initiatorSourceAddress
                            })
    }

    /*
    this.order.status = 'Created'
    this.order.initiatorPK = this.getPK(seed)
    this.order.direct = fromToken === 'TON CRYSTAL'
    this.order.fromToken = fromToken
    this.order.toToken = toToken
    this.order.rate = rate
    this.order.amount = amount
    this.order.minAmount = minAmount
    this.order.lockTime = lockTime
    // initiatorTargetAddress (alt chain) if direct
    // initiatorSourceAddress (alt chain) if not direct
    this.order.initiatorAltAddress = initiatorAltAddress
    if (this.order.direct) {
      this.order.secret = 'secret'
      this.order.hash = '0xdeadbeef'
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
    return await this.updateInfo(this.order.initiatorPK)
    */
  }

  async confirmOrder (order, amount, recipientAltAddress, secret, seed, checks=true) {
    console.log('confirmOrder', order, amount, recipientAltAddress, seed)

    if (checks) {
      // update order info
      if (order.direct) {
        order = await this.getDirectOrder(order.swapId, order.id)
      } else {
        order = await this.getReversedOrder(order.swapId, order.id)
      }
      if (!order) throw Error('Order already closed')
      if (order.confirmed) throw Error('Order already confirmed')
    }

    if (!this.wallet) throw Error('Not logged')
    if (seed !== this.wallet.seed) throw Error('Invalid seed phrase')

    if (order.direct) {

      let value = BigInteger(amount)
      let confirmatorSourceAddress = this.hexAlign(recipientAltAddress, 66)

      return await this._runSmcMethod(this.TRANSACTION_VALUE,
                            'confirmDirectOrder',
                            {
                              dbId: order.swapId,
				                      value: '0x' + value.toString(16),
				                      initiatorAddress: order.id,
				                      confirmatorSourceAddress: confirmatorSourceAddress
                            })
    } else {

      let value = BigInteger(amount)
      let secretHash = '0x' + this.hexAlign(await this.sha256(secret), 64)
      let confirmatorTargetAddress = this.hexAlign(recipientAltAddress, 66)

      return await this._runSmcMethod(this.TRANSACTION_VALUE,
                            'confirmReversedOrder',
                            {
                              dbId: order.swapId,
				                      value: '0x' + value.toString(16),
				                      initiatorAddress: order.id,
                              confirmatorTargetAddress: confirmatorTargetAddress,
                              secretHash: secretHash
                            })
    }
    /*
    this.order.status = 'Confirmed'
    this.order.recipientPK = this.getPK(seed)
    this.order.recipientAmount = amount
    // recipientTargetAddress (alt chain) if not direct
    // recipientSourceAddress (alt chain) if direct
    this.order.recipientAltAddress = recipientAltAddress
    if (!this.order.direct) {
      this.order.secret = 'secret'
      this.order.hash = '0xdeadbeef'
    }
    await new Promise(resolve => setTimeout(resolve, 2000))
    */
  }

  async closeOrder(order, seed, checks=true) {

    if (checks) {
      // update order info
      if (order.direct) {
        order = await this.getDirectOrder(order.swapId, order.id)
      } else {
        order = await this.getReversedOrder(order.swapId, order.id)
      }
      if (!order) throw Error('Order already closed')
      if (order.confirmed) throw Error('Order already confirmed')
    }

    if (!this.wallet) throw Error('Not logged')
    if (seed !== this.wallet.seed) throw Error('Invalid seed phrase')
    if (order.id !== this.wallet.getAddress()) throw Error('Cannot close another\'s order')

    if (order.direct) {

      return await this._runSmcMethod(this.TRANSACTION_VALUE,
                            'deleteDirectOrder',
                            {
                              dbId: order.swapId
                            })
    } else {

      return await this._runSmcMethod(this.TRANSACTION_VALUE,
                            'deleteReversedOrder',
                            {
                              dbId: order.swapId
                            })
    }
  }

  async finishOrderWithSecret(order, secret, seed, checks=true) {

    if (typeof secret !== 'string') {
      secret = this.bytesToHex(secret)
    } else {
      secret = secret.replace('0x', '')
    }
    secret = this.hexAlign(secret, 64)

    if (checks) {
      // update order info
      if (order.direct) {
        order = await this.getDirectOrder(order.swapId, order.id)
      } else {
        order = await this.getReversedOrder(order.swapId, order.id)
      }
      if (!order) throw Error('Order already closed')
      if (!order.confirmed) throw Error('Order not confirmed')
      // check secret & hash
    }

    if (!this.wallet) throw Error('Not logged')
    if (seed !== this.wallet.seed) throw Error('Invalid seed phrase')

    if (order.direct) {

      return await this._runSmcMethod(this.TRANSACTION_VALUE,
                            'finishDirectOrderWithSecret',
                            {
                              dbId: order.swapId,
                              initiatorAddress: order.id,
                              secret: secret
                            })

    } else {

      return await this._runSmcMethod(this.TRANSACTION_VALUE,
                            'finishReversedOrderWithSecret',
                            {
                              dbId: order.swapId,
                              initiatorAddress: order.id,
                              secret: secret
                            })
    }
  }


  async finishOrderWithTimeout(order, seed, checks=true) {

    if (checks) {
      // update order info
      if (order.direct) {
        order = await this.getDirectOrder(order.swapId, order.id)
      } else {
        order = await this.getReversedOrder(order.swapId, order.id)
      }
      if (!order) throw Error('Order already closed')
      if (!order.confirmed) throw Error('Order not confirmed')
    }

    if (!this.wallet) throw Error('Not logged')
    if (seed !== this.wallet.seed) throw Error('Invalid seed phrase')

    if (order.direct) {

      return await this._runSmcMethod(this.TRANSACTION_VALUE,
                            'finishDirectOrderWithTimeout',
                            {
                              dbId: order.swapId,
                              initiatorAddress: order.id
                            })
    } else {

      return await this._runSmcMethod(this.TRANSACTION_VALUE,
                            'finishReversedOrderWithTimeout',
                            {
                              dbId: order.swapId,
                              initiatorAddress: order.id
                            })
    }
  }

  async getOrders (fromToken, toToken) {
    const swapDirect = fromToken === 'TON CRYSTAL'
    const swapId = swapDirect ? this.directTable[toToken] : this.reversedTable[fromToken]

    if (swapDirect) {
      return await this.getDirectOrders(swapId)
    } else {
      return await this.getReversedOrders(swapId)
    }
  }

  // TODO
  async getOrder (fromToken, toToken, initiatorPK) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    return this.order
  }

  /*
  async closeOrder (fromToken, toToken, pk) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    return true
  }
  */
}


module.exports = TonSwapOrderbook;