const config = require('../../config')
const axios = require('axios')
const md5 = require('md5')
const KKBOX = require('../api/KKBOX')

const TextMessage = require('../msg/TextMessage')
const ImageMessage = require('../msg/ImageMessage')
const KKBOXMessage = require('../msg/KKBOXMessage')

class Olami {
    constructor(appKey = config.olami.appKey, appSecret = config.olami.appSecret, inputType = 1) {
        this.URL = 'https://tw.olami.ai/cloudservice/api'
        this.appKey = appKey
        this.appSecret = appSecret
        this.inputType = inputType
    }

    async nli(text, cusid = null) {
        const timestamp = Date.now()
        const response = await axios.post(this.URL, {}, {
            params: {
                appkey: this.appKey,
                api: 'nli',
                timestamp: timestamp,
                sign: md5(`${this.appSecret}api=nliappkey=${this.appKey}timestamp=${timestamp}${this.appSecret}`),
                cusid: cusid,
                rq: JSON.stringify({'data_type': 'stt', 'data': {'input_type': this.inputType, 'text': text}})
            }
        })
        const nli = response.data.data.nli[0]
        return await this._intentDetection(nli)
    }

    async _intentDetection(nli) {
        let reply = []

        const type = nli.type
        const desc = nli.desc_obj
        const data = nli.data_obj
        const semantic = nli.semantic

        function handleSelectionType(desc) {
            let text
            const descType = desc.type

            switch (descType) {
                case 'news':
                    text = data.map((el, index) => index + 1 + '. ' + el.title).join('\n')
                case 'poem':
                    text = data.map((el, index) => index + 1 + '. ' + el.poem_name + ' - ' + el.author).join('\n')
                case 'cooking':
                    text = data.map((el, index) => index + 1 + '. ' + el.name).join('\n')
                default:
                    text = '對不起，你說的我還不懂，能換個說法嗎？'
            }

            return new TextMessage(text).toLineMessage()
        }

        async function handleMusicKKBOXType(semantic) {
            function getKeyWord(semantic, dataType) {
                function getSlotValueByName(slotName) {
                    return semantic.slots.filter(slot => slot.name === slotName)[0].value
                }

                switch (dataType) {
                    case 'artist':
                        return getSlotValueByName('artist_name')
                    case 'album':
                        return getSlotValueByName('album_name')
                    case 'track':
                        return getSlotValueByName('track_name')
                    case 'playlist':
                        return getSlotValueByName('keyword')
                }
            }

            const dataType = semantic.modifier[0].split('_')[2]
            const keyWord = getKeyWord(semantic, dataType)

            const api = await KKBOX.init()
            const data = await api
                .searchFetcher
                .setSearchCriteria(keyWord, dataType)
                .fetchSearchResult()
                .then(response => {
                    return response.data[dataType + 's'].data
                })
            return new KKBOXMessage(data).toLineMessage()
        }

        if("result" in desc)
            reply.push(new TextMessage(desc.result).toLineMessage())
        switch (type) {
            case 'kkbox':
                if(data.length > 0) {
                    reply.push(new KKBOXMessage(data).toLineMessage())
                }
                break
            case 'ds':
                reply.push(new TextMessage('請用 /help 指令看看我能怎麼幫助您').toLineMessage())
                break
            case 'selection':
                reply.push(handleSelectionType(desc))
                break
            case 'news':
                reply.push(new TextMessage(data[0].detail).toLineMessage())
                break
            case 'baike':
                reply.push(new TextMessage(data[0].description).toLineMessage())
                break
            case 'joke':
            case 'cooking':
                reply.push(new TextMessage(data[0].content).toLineMessage())
                break
            case 'music_kkbox':
                reply.push(await handleMusicKKBOXType(semantic[0]))
                break
        }

        return reply
    }
}

module.exports = new Olami()
