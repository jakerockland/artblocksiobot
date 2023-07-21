import * as dotenv from 'dotenv'
dotenv.config()
import { ETwitterStreamEvent, TwitterApi } from 'twitter-api-v2'
import { Mint } from './MintBot'
import { ensOrAddress, timeout } from './APIBots/utils'
import axios from 'axios'

const TWITTER_TIMEOUT_MS = 14 * 1000

export class TwitterBot {
  twitterClient: TwitterApi
  constructor({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
    listener,
  }: {
    appKey: string
    appSecret: string
    accessToken: string
    accessSecret: string
    listener?: boolean
  }) {
    this.twitterClient = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    })
    // if (listener) {
    //   this.initListener()
    // }
  }

  async initListener() {
    console.log('Initializing Twitter listener...')
    const streamRules = await this.twitterClient.v2.streamRules()
    console.log(streamRules)
    if (!streamRules.data) {
      this.twitterClient.v2.updateStreamRules({
        add: [
          { value: '@artbot-testing -is:retweet', tag: 'artbot mentioned' },
        ],
      })
    }
    const stream = await this.twitterClient.v2.searchStream({
      'tweet.fields': ['referenced_tweets', 'author_id'],
      expansions: ['referenced_tweets.id'],
    })
    // Enable auto reconnect
    stream.autoReconnect = true

    stream.on(ETwitterStreamEvent.Data, async (tweet) => {
      console.log('TWEET!!!')
      console.log(tweet)
      // Reply to tweet
      await this.twitterClient.v1.reply(
        'Hi!! I am here and I am working!',
        tweet.data.id
      )
    })
  }

  async uploadTwitterImage(imgBinary: Buffer): Promise<string | undefined> {
    try {
      // use race function to timeout because twitter library doesn't timeout
      const uploadRes = await Promise.race([
        timeout(TWITTER_TIMEOUT_MS, 'Twitter post timed out'),
        this.twitterClient.v1.uploadMedia(imgBinary, { mimeType: 'png' }),
      ])
      return uploadRes
    } catch (e) {
      console.error(e)
      return undefined
    }
  }
  async tweetArtblock(artBlock: Mint) {
    const imageUrl = artBlock.image
    if (!artBlock.image) {
      console.error('No artblock image defined', JSON.stringify(artBlock))
      return
    }
    // now that we support animated projects with GIF/MP4 outputs this logic's needed to make sure we only post GIF to Discord/Twitter
    // TODO: mint tweets aren't posting right now. Need to fix this and handle .gif extensions in uploadTwitterImage()
    // artBlocksData.image = replaceVideoWithGIF(artBlock.image)

    const imgResp = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    })

    if (!imgResp || !imgResp.data) {
      console.error('No image binary returned', JSON.stringify(artBlock))
      return
    }
    const imgBinary = Buffer.from(imgResp.data, 'binary')
    const mediaId = await this.uploadTwitterImage(imgBinary)

    if (!mediaId) {
      console.error('no media id returned, not tweeting')
      return
    }

    const ownerText = await ensOrAddress(artBlock.owner)

    const tweetText = `${artBlock.tokenName} minted${
      ownerText ? ` by ${ownerText}` : ''
    }. \n\n${artBlock.artblocksUrl}`
    console.log(`Tweeting ${tweetText}`)

    const tweetRes = await this.twitterClient.v2.tweet(tweetText, {
      text: tweetText,
      media: { media_ids: [mediaId] },
    })

    return {
      tweetRes,
    }
  }

  async sendToTwitter(mint: Mint) {
    try {
      await this.tweetArtblock(mint)
    } catch (e) {
      console.error('Error posting to Twitter: ', e)
    }
  }
}
