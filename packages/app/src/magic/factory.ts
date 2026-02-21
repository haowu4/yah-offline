import { AppCtx } from "../appCtx.js"
import { AbstractMagicApi } from "./api.js"
import { DevMagicApi } from "./imple/dev.js"
import { OpenaiMagicApi } from "./imple/openai.js"

export function createMagicApi(args: { appCtx: AppCtx }): AbstractMagicApi {
  const provider = args.appCtx.config.api.magicProvider
  if (provider === "dev") {
    return new DevMagicApi()
  }
  return new OpenaiMagicApi({ appCtx: args.appCtx })
}
