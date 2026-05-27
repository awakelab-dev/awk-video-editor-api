import { Response, Router } from 'express'
import {
  downloadNounProjectIcon,
  IconProvider,
  IconProviderConfigurationError,
  listIconCategories,
  searchIcons,
  validateNounProjectDownloadParams,
  validateIconSearchParams,
} from '../domain/icons'

const router = Router()

router.get('/nounproject/:iconId/file', async (req, res: Response, next) => {
  return handleNounProjectDownload(req.params, req.query, res, next, true)
})

router.get('/nounproject/:iconId/download', async (req, res: Response, next) => {
  return handleNounProjectDownload(req.params, req.query, res, next, false)
})

router.get('/', async (req, res: Response, next) => {
  return handleIconSearch(req.query, undefined, res, next)
})

router.get('/iconify', async (req, res: Response, next) => {
  return handleIconSearch(req.query, 'iconify', res, next)
})

router.get('/nounproject', async (req, res: Response, next) => {
  return handleIconSearch(req.query, 'nounproject', res, next)
})

async function handleIconSearch(rawQuery: any, providerOverride: IconProvider | undefined, res: Response, next: (error?: any) => void) {
  try {
    const { errors, params } = validateIconSearchParams(rawQuery, providerOverride)
    if (errors.length > 0) {
      return sendValidationError(res, errors)
    }

    const result = await searchIcons(params)
    return res.status(200).json({
      success: true,
      message: 'Icons fetched successfully',
      data: {
        ...result,
        query: params.q || '',
        originalQuery: result.originalQuery,
        translatedQuery: result.translatedQuery,
        provider: result.provider,
        category: params.category || null,
        categories: listIconCategories(),
        security: {
          svgReturnedInSearch: false,
          rawMarkupReturnedInSearch: false,
          renderMode: 'url-metadata',
        },
      },
    })
  } catch (error) {
    return handleKnownIconError(error, res, next)
  }
}

async function handleNounProjectDownload(
  rawParams: any,
  rawQuery: any,
  res: Response,
  next: (error?: any) => void,
  asFile: boolean,
) {
  try {
    const { errors, params } = validateNounProjectDownloadParams(rawParams, rawQuery)
    if (errors.length > 0) {
      return sendValidationError(res, errors)
    }

    const result = await downloadNounProjectIcon(params)
    if (asFile) {
      const fileBytes = Buffer.from(result.base64EncodedFile, 'base64')
      res.setHeader('Content-Type', result.contentType)
      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).send(fileBytes)
    }

    return res.status(200).json({
      success: true,
      message: 'Noun Project icon downloaded successfully',
      data: result,
    })
  } catch (error) {
    return handleKnownIconError(error, res, next)
  }
}

function handleKnownIconError(error: any, res: Response, next: (error?: any) => void) {
  if (error instanceof IconProviderConfigurationError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
      code: error.code,
      errors: error.details,
    })
  }

  if (error?.status === 422 && Array.isArray(error.details)) {
    return sendValidationError(res, error.details)
  }

  return next(error)
}

function sendValidationError(res: Response, errors: Array<{ field: string, message: string }>) {
  return res.status(422).json({
    success: false,
    message: 'Validation failed',
    errors,
  })
}

export default router
