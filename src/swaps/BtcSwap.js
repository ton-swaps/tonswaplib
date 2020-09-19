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
    let estimatedFee = BigNumber(await this.estimateFeeValue({ inSatoshis, address, speed, method: 'swap' /*, txSize: size */}))

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
    const { script, txRaw, secret } = data

    const scriptData = this.bitcoin.payments.p2sh({ redeem: { output: script, network: this.network }, network: this.network })

    const hashType      = this.bitcoin.Transaction.SIGHASH_ALL
    const privKey = this.bitcoin.ECPair.fromWIF(this.getPrivateKey(), this.network)
    const signatureHash = txRaw.hashForSignature(inputIndex, scriptData.redeem.output, hashType);

    const redeemScriptSig = this.bitcoin.payments.p2sh({ 
      network: this.network, 
      redeem: { 
        network: this.network, 
        output: scriptData.redeem.output, 
        input: this.bitcoin.script.compile([ 
          this.bitcoin.script.signature.encode(privKey.sign(signatureHash), hashType),
          this.app.services.auth.accounts.btc.getPublicKeyBuffer(),
          Buffer.from(secret.replace(/^0x/, ''), 'hex'),
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

    const { secretHash, ownerPublicKey, recipientPublicKey, lockTime } = data

    const script = this.bitcoin.script.compile([

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

    const expectedConfidence = expected.confidence || 0.95
    const unspents      = await this.fetchUnspents(scriptAddress)
    const expectedValue = expected.value.multipliedBy(1e8).integerValue()
    const totalUnspent  = unspents.reduce((summ, { satoshis }) => summ + satoshis, 0)

    const confidentUnspents = await this.filterConfidentUnspents(unspents, expectedConfidence)
    const totalConfidentUnspent = confidentUnspents.reduce((summ, { satoshis }) => summ + satoshis, 0)

    if (expectedValue.isGreaterThan(totalUnspent)) {
      return `Expected script value: ${expectedValue.toNumber()}, got: ${totalUnspent}, address: ${scriptAddress}`
    }
    if (expected.lockTime > lockTime) {
      return `Expected script lockTime: ${expected.lockTime}, got: ${lockTime}, address: ${scriptAddress}`
    }
    if (expected.recipientPublicKey !== recipientPublicKey) {
      return `Expected script recipient publicKey: ${expected.recipientPublicKey}, got: ${recipientPublicKey}`
    }
    if (expectedValue.isGreaterThan(totalConfidentUnspent)) {
      return `Expected script value: ${expectedValue.toString()} with confidence above ${expectedConfidence}, got: ${totalConfidentUnspent}, address: ${scriptAddress}`
    }
  }

  /**
   *
   * @param {object} data
   * @param {object} data.scriptValues
   * @param {BigNumber} data.amount
   * @param {function} handleTransactionHash
   * @param {string} hashName
   * @returns {Promise}
   */
  fundScript(data, handleTransactionHash, hashName) {
    const { scriptValues, amount } = data

    return new Promise(async (resolve, reject) => {
      try {
        const { scriptAddress } = this.createScript(scriptValues, hashName)
        const ownerAddress = this.getAddress()

        const tx            = new this.bitcoin.TransactionBuilder(this.network)
        const unspents      = await this.fetchUnspents(ownerAddress)

        const fundValue     = amount.multipliedBy(1e8).integerValue().toNumber()
        const feeValueBN    = await this.getTxFee({ inSatoshis: true, address: ownerAddress })
        const feeValue      = feeValueBN.integerValue().toNumber()
        const totalUnspent  = unspents.reduce((summ, { satoshis }) => summ + satoshis, 0)
        const skipValue     = totalUnspent - fundValue - feeValue

        if (totalUnspent < feeValue + fundValue) {
          throw new Error(`Total less than fee: ${totalUnspent} < ${feeValue} + ${fundValue}`)
        }

        unspents.forEach(({ txid, vout }) => tx.addInput(txid, vout))
        tx.addOutput(scriptAddress, fundValue)
        tx.addOutput(this.getAddress(), skipValue)
        tx.__INPUTS.forEach((input, index) => {
          tx.sign(index, this.app.services.auth.accounts.btc)
        })

        const txRaw = tx.buildIncomplete()

        if (typeof handleTransactionHash === 'function') {
          handleTransactionHash(txRaw.getId())
        }

        try {
          const result = true;//await this.broadcastTx(txRaw.toHex())

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

    const unspents      = await this.fetchUnspents(address)
    const totalUnspent  = unspents && unspents.length && unspents.reduce((summ, { satoshis }) => summ + satoshis, 0) || 0

    return totalUnspent
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
      const { scriptAddress } = this.createScript(data, hashName)

      address = scriptAddress
    }
    else {
      throw new Error('Wrong data type')
    }

    const unspents      = await this.fetchUnspents(address)
    const totalUnspent  = unspents && unspents.length && unspents.reduce((summ, { satoshis }) => summ + satoshis, 0) || 0

    return totalUnspent
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

    const tx            = new this.bitcoin.TransactionBuilder(this.network)
    const unspents      = await this.fetchUnspents(scriptAddress)

    const feeValueBN    = await this.getTxFee({ inSatoshis: true, address: scriptAddress })
    const feeValue      = feeValueBN.integerValue().toNumber()
    const totalUnspent  = unspents.reduce((summ, { satoshis }) => summ + satoshis, 0)

    if (BigNumber(totalUnspent).isLessThan(feeValue)) {
      /* Check - may be withdrawed */
      if (typeof this.checkWithdraw === 'function') {
        const hasWithdraw = await this.checkWithdraw(scriptAddress)
        if (hasWithdraw
          && hasWithdraw.address.toLowerCase() == destAddress.toLowerCase()
        ) {
          // already withdrawed
          return {
            txId: hasWithdraw.txid,
            alreadyWithdrawed: true
          }
        } else {
          throw new Error(`Total less than fee: ${totalUnspent} < ${feeValue}`)
        }
      } else {
        throw new Error(`Total less than fee: ${totalUnspent} < ${feeValue}`)
      }
    }

    if (isRefund) {
      tx.setLockTime(scriptValues.lockTime)
    }

    unspents.forEach(({ txid, vout }) => tx.addInput(txid, vout, 0xfffffffe))
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
  withdraw(data, isRefund, hashName) {
    return new Promise(async (resolve, reject) => {
      try {
        const txRaw = await this.getWithdrawRawTransaction(data, isRefund, hashName)

        if (txRaw.alreadyWithdrawed) {
          resolve(txRaw.txId)
          return
        }

        debug('swap.core:swaps')('raw tx withdraw', txRaw.txHex)

        const result = await this.broadcastTx(txRaw.txHex)

        // Wait some delay until transaction can be rejected or broadcast failed
        await new Promise(resolve => setTimeout(resolve, 10000))

        const txSuccess = await this.checkTX(txRaw.txId)

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
    const txInfo = await this.fetchTxInfo(txID)
    if (txInfo
      && txInfo.senderAddress
      && txInfo.txid
      && (txInfo.txid.toLowerCase() == txID.toLowerCase())
    ) {
      return true
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
  refund(data, hashName) {
    return this.withdraw(data, true, hashName)
  }
}


module.exports = BtcSwap;