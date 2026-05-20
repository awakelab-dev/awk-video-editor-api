import { Response, Router } from 'express'
import { listIconCategories, searchIcons, validateIconSearchParams } from '../domain/icons'

const router = Router()

router.get('/', async (req, res: Response, next) => {
  try {
    const { errors, params } = validateIconSearchParams(req.query)
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
        provider: params.provider,
        category: params.category || null,
        categories: listIconCategories(),
        security: {
          svgReturnedInSearch: false,
          renderMode: 'iconify-id',
        },
      },
    })
  } catch (error) {
    return next(error)
  }
})

export default router
