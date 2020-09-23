const debug = require('../debug')
const  BigNumber = require('bignumber.js')
const {mainnet, testnet} = require('../helpers/bitcoin');
const bip32 = require('bip32');
const bip39 = require('bip39');

class BtcSwap {

  /**
   *
   * @param options
   * @param options.fetchBalance
   * @param options.fetchUnspents
   * @param options.broadcastTx
   * @param options.fetchTxInfo {(tx_hash) => Promise({ confidence, fees })}
   * @param options.estimateFeeValue { ({ inSatoshis, speed, address, txSize }) => Promise(fee_value) }
   */
  constructor(options) {

    this._swapName = 'BTC';

    this.btc = options.mainnet ? mainnet() : testnet();
    this.bitcoin = this.btc.core;

    this.network = (
      options.mainnet
        ? this.bitcoin.networks.bitcoin
        : this.bitcoin.networks.testnet);

    this.fetchBalance = (address) => this.btc.fetchBalance(address);
    this.fetchUnspents = (scriptAddress) => this.btc.fetchUnspents(scriptAddress);
    this.broadcastTx = (txRaw) => this.btc.broadcastTx(txRaw);
    this.fetchTxInfo = (txid) => this.btc.fetchTxInfo(txid);
    this.estimateFeeValue = ({ inSatoshis, speed, address, txSize } = {}) => this.btc.estimateFeeValue({ inSatoshis, speed, address, txSize });
    this.checkWithdraw = (scriptAddress) => this.btc.checkWithdraw(scriptAddress);

    this.feeValue = options.feeValue || 546
    this.mnemonic = options.mnemonic
  }

  getPublicKey (mnemonic) {
    const account = new this.bitcoin.ECPair.fromWIF(this.getPrivateKey(mnemonic), this.network)

    return account.publicKey.toString('hex')
  }

  getAddress(mnemonic) {
    mnemonic = mnemonic || this.mnemonic;
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const node = bip32.fromSeed(seed, this.network);

    return this.bitcoin.payments.p2pkh({ pubkey: node.publicKey, network: this.network }).address;
  }

  getPrivateKey(mnemonic) {
    mnemonic = mnemonic || this.mnemonic;
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const node = bip32.fromSeed(seed, this.network);

    return node.toWIF();
  }

  getKeyPair(mnemonic) {
    mnemonic = mnemonic || this.mnemonic;
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const node = bip32.fromSeed(seed, this.network);

    return node;
  }

  getScripValues(secretHash, ownerPublicKey, recipientPublicKey, lockTime) {
    const values = {
      secretHash: secretHash.replace('0x', ''),
      ownerPublicKey: ownerPublicKey.replace('0x', ''),
      recipientPublicKey: recipientPublicKey.replace('0x', ''),
      lockTime: lockTime
    }
    return values
  }

  /**
   *
   * @param {object} options
   * @param {boolean} options.inSatoshis
   * @param {Number} options.size
   * @param {String} options.speed
   * @param {String} options.address
   * @returns {BigNumber}
   * @public
   */
  async getTxFee({ inSatoshis, size, speed = 'fast', address } = {}) {
    let estimatedFee = BigNumber(await this.estimateFeeValue({ inSatoshis, address, speed, method: 'swap', txSize: size}))

    this.feeValue = estimatedFee

    return inSatoshis
      ? estimatedFee
      : estimatedFee.dividedBy(1e8).dp(0, BigNumber.ROUND_UP)
  }

  /**
   *
   * @param {array} unspents
   * @param {Number} expectedConfidenceLevel
   * @returns {array}
   * @private
   */
  async filterConfidentUnspents(unspents, expectedConfidenceLevel = 0.95) {
    const feesToConfidence = async (fees, size, address) => {
      const currentFastestFee = await this.getTxFee({ inSatoshis: true, size, speed: 'fast', address })

      return BigNumber(fees).isLessThan(currentFastestFee)
        ? BigNumber(fees).dividedBy(currentFastestFee).toNumber()
        : 1
    }

    const confirmationsToConfidence = confs => confs > 0 ? 1 : 0

    const fetchConfidence = async ({ txid, confirmations }) => {
      const confidenceFromConfirmations = confirmationsToConfidence(confirmations)

      if (BigNumber(confidenceFromConfirmations).isGreaterThanOrEqualTo(expectedConfidenceLevel)) {
        return confidenceFromConfirmations
      }

      try {
        const info = await this.fetchTxInfo(txid)

        const { fees, size, senderAddress } = info

        if (fees) {
          return await feesToConfidence(fees, size, senderAddress)
        }

        throw new Error(`txinfo=${{ confirmations, fees, size, senderAddress }}`)

      } catch (err) {
        console.error(`BtcSwap: Error fetching confidence: using confirmations > 0:`, err.message)
        return confidenceFromConfirmations
      }
    }

    const confidences = await Promise.all(unspents.map(fetchConfidence))

    return unspents.filter((utxo, index) => {
      debug('swap.core:swaps')(`confidence[${index}]:`, confidences[index])
      return BigNumber(confidences[index]).isGreaterThanOrEqualTo(expectedConfidenceLevel)
    })
  }

  hexAlign(value, digits) {
    value = value.replace('0x', '')
    for (let i = digits - value.length; i > 0; i--) {
      value = '0' + value
    }
    return value
  }

  /**
   *
   * @param {object} data
   * @param {object} data.script
   * @param {*} data.txRaw
   * @param {string} data.secret
   * @param {number} inputIndex
   * @private
   */
  _signTransaction(data, inputIndex = 0) {
    debug('swap.core:swaps')('signing script input', inputIndex)
    let { script, txRaw, secret } = data

    const scriptData = this.bitcoin.payments.p2sh({ redeem: { output: script, network: this.network }, network: this.network })

    const hashType      = this.bitcoin.Transaction.SIGHASH_ALL
    const privKey = this.bitcoin.ECPair.fromWIF(this.getPrivateKey(), this.network)
    console.log('privKey',privKey)
    const signatureHash = txRaw.hashForSignature(inputIndex, scriptData.redeem.output, hashType);
    const sign = this.bitcoin.script.signature.encode(privKey.sign(signatureHash), hashType);

    const PK = this.getPublicKey();
    console.log('secret', secret, Buffer.from(secret.replace(/^0x/, ''), 'hex'))
    console.log('getPublicKey', PK, Buffer.from(PK.replace(/^0x/, ''), 'hex'))
    console.log('publickeybuffer', privKey.publicKey.toString('hex'))
    console.log('sign', sign)

    if (privKey.publicKey.length != 33) {
      throw Error('invalid pubkey')
    }
    secret = this.hexAlign(secret, 64)
    secret = Buffer.from(secret, 'hex')
    if (secret.length != 32) {
      throw Error('invalid secret length')
    }

    const redeemScriptSig = this.bitcoin.payments.p2sh({ 
      network: this.network, 
      redeem: { 
        network: this.network, 
        output: scriptData.redeem.output, 
        input: this.bitcoin.script.compile([ 
          sign,
          privKey.publicKey,
          secret,
        ]) 
      } 
    }).input 

    txRaw.setInputScript(inputIndex, redeemScriptSig);
  }

  /**
   *
   * @param {object} data
   * @param {string} data.secretHash
   * @param {string} data.ownerPublicKey
   * @param {string} data.recipientPublicKey
   * @param {number} data.lockTime
   * @returns {{scriptAddress: *, script: (*|{ignored})}}
   */
  createScript(data, hashName = 'SHA256') {
    const hashOpcodeName = `OP_${hashName.toUpperCase()}`
    const hashOpcode = this.bitcoin.opcodes[hashOpcodeName]

    let { secretHash, ownerPublicKey, recipientPublicKey, lockTime } = data

    secretHash = this.hexAlign(secretHash, 64)
    if (secretHash.length != 64) {
      throw Error('invalid secretHash length')
    }
    recipientPublicKey = this.hexAlign(recipientPublicKey, 66)
    ownerPublicKey = this.hexAlign(ownerPublicKey, 66)

    const script = this.bitcoin.script.compile([
      
      hashOpcode,
      Buffer.from(secretHash, 'hex'),
      this.bitcoin.opcodes.OP_EQUAL,
      this.bitcoin.opcodes.OP_IF,

        this.bitcoin.opcodes.OP_DUP,
        Buffer.from(recipientPublicKey, 'hex'),
        this.bitcoin.opcodes.OP_EQUALVERIFY,
        this.bitcoin.opcodes.OP_CHECKSIG,

      this.bitcoin.opcodes.OP_ELSE,

        this.bitcoin.script.number.encode(lockTime),
        this.bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        this.bitcoin.opcodes.OP_DROP,

        this.bitcoin.opcodes.OP_DUP,
        Buffer.from(ownerPublicKey, 'hex'),
        this.bitcoin.opcodes.OP_EQUALVERIFY,
        this.bitcoin.opcodes.OP_CHECKSIG,

      this.bitcoin.opcodes.OP_ENDIF,

      /*
      hashOpcode,
      Buffer.from(secretHash, 'hex'),
      this.bitcoin.opcodes.OP_EQUALVERIFY,

      Buffer.from(recipientPublicKey, 'hex'),
      this.bitcoin.opcodes.OP_EQUAL,
      this.bitcoin.opcodes.OP_IF,

      Buffer.from(recipientPublicKey, 'hex'),
      this.bitcoin.opcodes.OP_CHECKSIG,

      this.bitcoin.opcodes.OP_ELSE,

      this.bitcoin.script.number.encode(lockTime),
      this.bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      this.bitcoin.opcodes.OP_DROP,
      Buffer.from(ownerPublicKey, 'hex'),
      this.bitcoin.opcodes.OP_CHECKSIG,

      this.bitcoin.opcodes.OP_ENDIF,
      */
    ])

    const scriptData = this.bitcoin.payments.p2sh({ redeem: { output: script, network: this.network }, network: this.network })
    const scriptAddress = scriptData.address

    return {
      scriptAddress,
      script,
    }
  }

  /**
   *
   * @param {object} data
   * @param {string} data.recipientPublicKey
   * @param {number} data.lockTime
   * @param {object} expected
   * @param {number} expected.value
   * @param {number} expected.lockTime
   * @param {string} expected.recipientPublicKey
   * @returns {Promise.<string>}
   */
  async checkScript(data, expected, hashName) {
    const { recipientPublicKey, lockTime } = data
    const { scriptAddress, script } = this.createScript(data, hashName)

    const amount = BigNumber(data.value)

    const unspents      = await this.fetchBalance(scriptAddress)
    const expectedValue = amount.integerValue()

    if (!expectedValue.isEqualTo(unspents)) {
      console.log(`Expected script value: ${expectedValue.toNumber()}, got: ${unspents}, address: ${scriptAddress}`)
      return false
    }
    return true
  }

  /**
   *
   * @param {object} data
   * @param {object} data.scriptValues
   * @param {BigNumber} data.amount
   * @param {string} data.mnemonic
   * @param {function} handleTransactionHash
   * @param {string} hashName
   * @returns {Promise}
   */
  fundScript(data, handleTransactionHash, hashName) {
    let { scriptValues, amount, mnemonic } = data
    amount = BigNumber(amount)

    return new Promise(async (resolve, reject) => {
      try {
        const { script, scriptAddress } = this.createScript(scriptValues, hashName)
        const ownerAddress = this.getAddress()

        const tx            = new this.bitcoin.TransactionBuilder(this.network)
        // const unspents      = await this.fetchUnspents(ownerAddress)
        const fundValue     = amount.integerValue().toNumber()
        const txSceleton = await this.btc.newTransaction(ownerAddress, scriptAddress, fundValue)
        console.log('txSceleton', txSceleton)
        // const feeValueBN    = await this.getTxFee({ inSatoshis: true, address: ownerAddress })
        // const feeValue      = feeValueBN.integerValue().toNumber()
        const feeValue      = txSceleton.tx.fees
        // const totalUnspent  = unspents.reduce((summ, { satoshis }) => summ + satoshis, 0)
        const totalUnspent  = txSceleton.tx.inputs.reduce((summ, { output_value }) => summ + output_value, 0)
        // const skipValue     = totalUnspent - fundValue - feeValue

        if (totalUnspent < feeValue + fundValue) {
          throw new Error(`Total less than fee: ${totalUnspent} < ${feeValue} + ${fundValue}`)
        }

        // unspents.forEach(({ txid, vout }) => tx.addInput(txid, vout))
        txSceleton.tx.inputs.forEach(({ prev_hash, output_index }) => tx.addInput(prev_hash, output_index))
        txSceleton.tx.outputs.forEach(({ addresses, value }) => tx.addOutput(addresses[0], value))

        // tx.addOutput(scriptAddress, fundValue)
        // tx.addOutput(this.getAddress(), skipValue)
        tx.__INPUTS.forEach((input, index) => {
          tx.sign({prevOutScriptType:'p2pkh', vin: index, keyPair: this.getKeyPair(mnemonic)})
        })

        const txRaw = tx.buildIncomplete()
        console.log('txRaw', txRaw, txRaw.getId(), txRaw.toHex())

        if (typeof handleTransactionHash === 'function') {
          handleTransactionHash(txRaw.getId())
        }

        try {
          const result = await this.broadcastTx(txRaw.toHex())

          resolve(result)
        }
        catch (err) {
          reject(err)
        }
      }
      catch (err) {
        reject(err)
      }
    })
  }

  /**
   *
   * @param {object|string} data - scriptValues or wallet address
   * @returns {Promise.<void>}
   */
  async getBalance(data, hashName) {
    let address

    if (typeof data === 'string') {
      address = data
    }
    else if (typeof data === 'object') {
      const { scriptAddress } = this.createScript(data, hashName)

      address = scriptAddress
    }
    else {
      throw new Error('Wrong data type')
    }

    //const unspents      = await this.fetchUnspents(address)
    //const totalUnspent  = unspents && unspents.length && unspents.reduce((summ, { value }) => summ + value, 0) || 0

    return await this.btc.fetchBalance(address)
  }

    /**
   *
   * @param {object|string} data - scriptValues or wallet address
   * @returns {Promise.<void>}
   */
  async getSecret(data, hashName) {
    let address

    if (typeof data === 'string') {
      address = data
    }
    else if (typeof data === 'object') {
      const { script, scriptAddress } = this.createScript(data, hashName)
      console.log('script', script.toString('hex'))

      address = scriptAddress
    }
    else {
      throw new Error('Wrong data type')
    }

    const info = await this.btc.fetchTxs(address)
    if (info.length > 0 && info[0].spentTxid.length !== 0) {
      const tx = await this.btc.fetchTxExt(info[0].spentTxid)
      if (tx.inputs.length < 1) {
        return
      }
      const script = tx.inputs[0].script
      // 1 (size) + n (sign) + 1 (size) + 33 (pk) + 1 (size) = 108
      const signLength = parseInt(script.slice(0, 2), 16)
      const secretPos = 1 + signLength + 1 + 33 + 1
      const secret = script.slice(secretPos*2, (secretPos+32)*2)
      console.log('tx', tx, secret)
      return secret
    }

    return
  }

  /**
   *
   * @param {object} data
   * @param {object} data.scriptValues
   * @param {string} data.secret
   * @param {boolean} isRefund
   * @returns {Promise}
   */
  async getWithdrawRawTransaction(data, isRefund, hashName) {
    const { scriptValues, secret, destinationAddress } = data
    const destAddress = (destinationAddress) ? destinationAddress : this.getAddress()

    const { script, scriptAddress } = this.createScript(scriptValues, hashName)
    console.log('scriptAddress', scriptAddress, 'script', script)

    const tx            = new this.bitcoin.TransactionBuilder(this.network)
    const balance      = await this.fetchBalance(scriptAddress)
    const unspents = await this.fetchUnspents(scriptAddress)
    console.log('unspents', unspents, balance)

    const feeValueBN    = await this.getTxFee({ inSatoshis: true, size: 348, address: scriptAddress })
    const feeValue      = feeValueBN.integerValue().toNumber()
    console.log('feeValue', feeValue)

    const totalUnspent  = unspents.reduce((summ, { value }) => summ + value, 0)
    console.log('totalUnspent', totalUnspent, feeValue, totalUnspent - feeValue)

    if (BigNumber(totalUnspent).isLessThan(feeValue) || BigNumber(totalUnspent).isEqualTo(feeValue)) {
      throw new Error(`Total less than fee: ${totalUnspent} <= ${feeValue}`)
    }

    if (isRefund) {
      tx.setLockTime(scriptValues.lockTime)
    }

    unspents.forEach(({ mintTxid, mintIndex }) => { console.log('addInput', mintTxid, mintIndex); tx.addInput(mintTxid, mintIndex, 0xfffffffe); })
    console.log('destAddress', destAddress)
    tx.addOutput(destAddress, totalUnspent - feeValue)

    const txRaw = tx.buildIncomplete()

    tx.__INPUTS.map((_, index) =>
      this._signTransaction({
        script,
        secret,
        txRaw,
      }, index)
    )

    const txHex = txRaw.toHex()
    const txId = txRaw.getId()
    console.log('txId', txId, 'txHex', txHex)

    return {
      txHex,
      txId,
    }
    return txRaw
  }

  /**
   *
   * @param {object} data
   * @param {object} data.scriptValues
   * @param {string} data.secret
   * @param {boolean} isRefund
   * @returns {Promise}
   */
  async getWithdrawHexTransaction(data, isRefund) {
    const txRaw = await this.getWithdrawRawTransaction(data, isRefund)

    return txRaw.txHex
  }

  /**
   *
   * @param {object} data
   * @param {object} data.scriptValues
   * @param {string} data.secret
   * @returns {Promise}
   */
  getRefundRawTransaction(data) {
    return this.getWithdrawRawTransaction(data, true)
  }

  /**
   *
   * @param {object} data
   * @param {object} data.scriptValues
   * @param {string} data.secret
   * @returns {Promise}
   */
  async getRefundHexTransaction(data) {
    const txRaw = await this.getRefundRawTransaction(data)

    return txRaw.txHex
  }

  /**
   *
   * @param {object} data
   * @param {object} data.scriptValues
   * @param {string} data.secret
   * @param {function} handleTransactionHash
   * @param {boolean} isRefund
   * @param {string} hashName
   * @returns {Promise}
   */
  withdraw(data, isRefund, handleTransactionHash, hashName) {
    return new Promise(async (resolve, reject) => {
      try {
        const txRaw = await this.getWithdrawRawTransaction(data, isRefund, hashName)

        if (typeof handleTransactionHash === 'function') {
          handleTransactionHash(txRaw.txId)
        }

        const result = await this.broadcastTx(txRaw.txHex)

        // Wait some delay until transaction can be rejected or broadcast failed
        await new Promise(resolve => setTimeout(resolve, 10000))

        let txSuccess;
        for (let i = 0; i < 30; i++) {
          txSuccess = await this.checkTX(txRaw.txId)
          if (txSuccess)
            break

          await new Promise(resolve => setTimeout(resolve, 10000))
        }

        if (txSuccess) {
          resolve(txRaw.txId)
        } else {
          console.warn('BtcSwap: cant withdraw', 'Generated TX not found')
          reject('TX not found. Try it later. ',txRaw.txId)
        }

      }
      catch (error) {
        console.warn('BtcSwap: cant withdraw', error.message)

        let errorMessage

        if (error.res && /non-final/.test(error.res.text)) {
          errorMessage = 'Try it later'
        } else if (/Total less than fee/.test(error.message)) {
          if (/Total less than fee: 0/.test(error.message)) {
            errorMessage = 'Address is empty'
          } else {
            errorMessage = 'Less than fee'
          }
        } else {
          errorMessage = error
        }

        reject(errorMessage)
      }
    })
  }

  /**
   * 
   * @param {string} txID
   * @returns {Promise}
   */
  async checkTX(txID) {
    try {
      const txInfo = await this.btc.fetchTxExt(txID)
      console.log('checkTX', txInfo)
      if (txInfo
        && txInfo.hash
        && (txInfo.hash.toLowerCase() == txID.toLowerCase())
      ) {
        return true
      }
    } catch (e) {
      console.log('checkTX failed, maybe tx not found')
    }

    return false
  }
  /**
   *
   * @param {object} data
   * @param {object} data.scriptValues
   * @param {string} data.secret
   * @param {function} handleTransactionHash
   * @param {string} hashName
   * @returns {Promise}
   */
  refund(data, handleTransactionHash, hashName) {
    return this.withdraw(data, true, handleTransactionHash, hashName)
  }
}


module.exports = BtcSwap;