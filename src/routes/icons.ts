import { Response, Router } from 'express'
import {
  IconProvider,
  IconProviderConfigurationError,
  listIconCategories,
  searchIcons,
  validateIconSearchParams,
} from '../domain/icons'

const router = Router()

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
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors,
      })
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
    if (error instanceof IconProviderConfigurationError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        code: error.code,
        errors: error.details,
      })
    }

    const typedError = error as any
    if (typedError?.status === 422 && Array.isArray(typedError.details)) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: typedError.details,
      })
    }

    return next(error)
  }
}

export default router
