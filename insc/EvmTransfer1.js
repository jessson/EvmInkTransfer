const ethers = require('ethers')
const { default: axios } = require('axios')
const cheerio = require('cheerio')

const CheckMiner = false
const Mode = 'Q'          // Q 表示查询  T 表示发送
let   NumOfTrans = 2000      // 当Mode=Q 表示要查询的张数，当Mode=T 表示要发送的张数
const PrivatePKey = ''    // 私钥， Mode=Q 无需私钥
const Provider = new ethers.providers.JsonRpcProvider("https://bsc-dataseed1.defibit.io")
const GasPrice = 3.1      // 3.1 gwei
const SendAddr = ''       // 发送地址
const RecvAddr = ''       // 接受地址
                          // InscHex  铭文16进制
const InscHex = '0x646174613a2c7b2270223a226273632d3230222c226f70223a226d696e74222c227469636b223a2262736369222c22616d74223a2231303030227d'

class InscInfo {
    constructor(inscInfo) {
        this.mintHash = inscInfo.trx_hash
        this.confirmed = inscInfo.confirmed
        this.blockNumber = inscInfo.block_number
        this.evmPosition = inscInfo.position
        this.ownerAddr = inscInfo.owner_address
        this.creatAddr = inscInfo.creator_address
    }
}

async function queryInsc(offset, addr = SendAddr) {
    const limit = 500
    const url = 'https://api.evm.ink/v1/graphql/'
    const uri = '\\x'+InscHex.slice(2)
    payload = {
        "query": "query GetUserInscriptions($limit: Int, $offset: Int, $order_by: [inscriptions_order_by!] = {}, $where: inscriptions_bool_exp = {}, $whereAggregate: inscriptions_bool_exp = {}) {\n  inscriptions_aggregate(where: $whereAggregate) {\n    aggregate {\n      count\n    }\n  }\n  inscriptions(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {\n    block_number\n    confirmed\n    content_uri\n    created_at\n    creator_address\n    owner_address\n    trx_hash\n    id\n    position\n    category\n    mtype\n    internal_trx_index\n    network_id\n    brc20_command {\n      reason\n      is_valid\n    }\n  }\n}",
        "variables": {
          "limit": limit,
            'offset': offset,
          "order_by": [
            {
              "position": "desc"
            }
          ],
          "whereAggregate": {
            "owner_address": {
              "_eq": addr.toLowerCase()
            },
              "content_uri": {
                  "_eq":uri
              },
            "network_id": {
              "_eq": "eip155:56"
            }
          },
          "where": {
            "owner_address": {
              "_eq": addr.toLowerCase()
            },
              "content_uri": {
                  "_eq": uri
              },
            "network_id": {
              "_eq": "eip155:56"
            }
          }
        },
        "operationName": "GetUserInscriptions"
      }

      const res = await axios.post(url, payload).catch(err=>{console.log(err)})
      if (res == undefined || res.data == undefined) {
        return null
      }

      const inscs = []
      for (let i = 0; i < res.data.data.inscriptions.length; ++i) {
        const insc = res.data.data.inscriptions[i]
        inscs.push(new InscInfo(insc))
      }
      return inscs
}

async function getMiner(blockNumber) {
    const html = await axios.get(`https://bscscan.com/block/${blockNumber}`)
    const $ = cheerio.load(html.data);
    const links = $('.col-md-9 a');
    let address = null
    links.each((index, element) => {
      const linkHref = $(element).attr('href');
      if (linkHref.startsWith('/address/0x')) {
        address = linkHref.slice(9)
        console.log(`block ${blockNumber} Miner ${address}`);
      }
    });
    return address
}

async function EvmInscTransfer(CheckerFunc) {
    const gasPrice = ethers.utils.parseUnits(''+GasPrice, 'gwei')
    let wallet = null
    if (Mode === 'T') {
        wallet = new ethers.Wallet(PrivatePKey, Provider)
    }

    let inscs = []
    for (let i = 0; ; ++i) {
        const ins = await queryInsc(i * 50)
        if (ins.length === 0 || ins == null) {
            break
        }
        inscs = inscs.concat(ins)
    }
    console.log("总张数:", inscs.length)
    let suc = 0
    NumOfTrans = NumOfTrans > inscs.length ? inscs.length : NumOfTrans
    for (let i = 0; i < inscs.length && suc < NumOfTrans; i++) {
        const mintTx = await Provider.getTransaction(inscs[i].mintHash)
        console.log("剩余待转", NumOfTrans-suc, "剩余待查", inscs.length-i , "查找hash", inscs[i].mintHash, mintTx.blockNumber)

        let miner = ''
        if (CheckMiner) {
          miner = await getMiner(mintTx.blockNumber)
          if (miner == undefined || miner == null) {
              console.log("获取Miner失败, 跳过")
              continue
          }
        }
        const check = CheckerFunc(mintTx, miner, mintTx.blockNumber, inscs[i].evmPosition)
        if (check !== 0) {
          continue
        }

        if (Mode === 'T') {
            const nonce = await wallet.getTransactionCount('pending')
            const sendTx = {
                from: SendAddr,
                to: RecvAddr,
                gasPrice: gasPrice,
                gasLimit: 25000,
                nonce: nonce,
                value: '0x0',
                data: mintTx.hash,
                chainId: 56,
                type: 0
            }
            console.log('转移hash', mintTx.hash, sendTx)

            const signTx = await wallet.signTransaction(sendTx);
            const recpit = await wallet.provider.sendTransaction(signTx).catch(err=>{
                console.log(err)
            })
            if (recpit != undefined) {
                suc++
            }
        } else {
          console.log("有效hash", inscs[i].mintHash, "owner:", inscs[i].ownerAddr, "mint", inscs[i].creatAddr)
        }
    }
}

//==================================================================
// filters
//==================================================================

function bnb48FansChecker(tx, miner, blockNumber, inscPos) {
  addr = addr.toLowerCase()
  const number = parseInt(blockNumber)
  if (number <= 34175786 || number > 34183076) {
      return -1
  }

  if (miner.toLowerCase() != '0x72b61c6014342d914470ec7ac2975be345796c2b') {
      return 1
  }

  if (tx.from.toLowerCase() === tx.to.toLowerCase() && tx.data == InscHex)
  {
      return 0
  }

  return 1
}

function bsc20BsciChecker(tx, miner, blockNumber, inscPos) {
if (tx.from.toLowerCase() === tx.to.toLowerCase() && tx.data == InscHex) {
  return 0
}
return 1
}


EvmInscTransfer(bsc20BsciChecker)