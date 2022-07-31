import {
  fromBase64, toHex, Bech32
} from '@cosmjs/encoding'
import { sha256 } from '@cosmjs/crypto'
import { multiply, divide, pow } from 'mathjs'

export class Validator {
  constructor(chain, data, registryData, blocks){
    this.chain = chain
    this.data = data || {}
    this.registryData = registryData || {}
    this.address = this.data.operator_address || this.registryData.address
    this.moniker = this.data.description?.moniker
    this.identity = this.data.description?.identity || this.registryData.profile?.identity
    this.blocks = blocks || []
    this.commission = {
      ...this.data.commission,
      rate: parseFloat(this.data.commission.commission_rates.rate)
    }
  }

  delegations(){
    const delegations = this.data.delegations
    if(!delegations?.total_tokens) return delegations || {}

    const price = this.chain.services.coingecko.price
    if(!price) return delegations

    const total_tokens = delegations.total_tokens
    const total_tokens_display = divide(total_tokens, pow(10, this.chain.decimals))
    const total_usd = multiply(total_tokens_display, price.usd)
    return {
      ...this.data.delegations,
      total_tokens_display,
      total_usd
    }
  }

  hexAddress(){
    const pubKey = this.data.consensus_pubkey
    if(pubKey){
      const raw = sha256(fromBase64(pubKey.key))
      const address = toHex(raw).slice(0, 40).toUpperCase()
      return address
    }
  }

  consensusAddress(prefix){
    const pubKey = this.data.consensus_pubkey
    if(pubKey){
      prefix = prefix || this.chain.consensusPrefix
      const raw = sha256(fromBase64(pubKey.key))
      const address = Bech32.encode(prefix, raw.slice(0, 20));
      return address
    }
  }

  uptimePeriods(){
    return this.missedBlockPeriods().map(period => {
      return {
        blocks: period.blocks,
        uptime: (period.blocks - period.missed) / period.blocks
      }
    })
  }

  uptimePercentage(){
    return this.signedBlocks().length / this.blocks.length
  }

  missedBlockPeriods(){
    const periods = []
    if(this.blocks.length > 200){
      periods.push({
        blocks: 100,
        missed: 100 - this.signedBlocks(100).length
      })
    }
    periods.push({
      blocks: this.blocks.length,
      missed: this.blocks.length - this.signedBlocks().length
    })
    const chainParams = this.chain.params
    const slashingPeriod = chainParams.slashing?.signed_blocks_window
    const slashingMissed = this.data.signing_info?.missed_blocks_counter
    if(slashingPeriod != undefined && slashingMissed != undefined){
      periods.push({
        blocks: parseInt(slashingPeriod),
        missed: parseInt(slashingMissed)
      })
    }
    return periods.sort((a, b) => {
      return a.blocks - b.blocks
    })
  }

  missedBlocks(max){
    const hexAddress = this.hexAddress()
    const blocks = this.blocks.filter(block => {
      return !block.signatures.find(el => el === hexAddress)
    })
    return blocks.slice(0, max || blocks.length)
  }

  signedBlocks(max){
    const hexAddress = this.hexAddress()
    const blocks = this.blocks.filter(block => {
      return block.signatures.find(el => el === hexAddress)
    })
    return blocks.slice(0, max || blocks.length)
  }

  toJSON(){
    const { moniker, identity, address, commission } = this
    const { path, name } = this.registryData
    return {
      path,
      name,
      moniker,
      identity,
      address,
      ...this.registryData,
      ...this.data,
      commission,
      hex_address: this.hexAddress(),
      uptime: this.uptimePercentage(),
      uptime_periods: this.uptimePeriods(),
      missed_blocks: this.missedBlocks().length,
      missed_blocks_periods: this.missedBlockPeriods(),
      delegations: this.delegations(),
    }
  }
}