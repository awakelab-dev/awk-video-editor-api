import { Response, Router } from 'express'
import { listIconCategories, searchIcons, validateIconSearchParams } from '../domain/icons'

const router = Router()

router.get('/', (req, res: Response) => {
  const { errors, params } = validateIconSearchParams(req.query)
  if (errors.length > 0) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
    })
  }

  const result = searchIcons(params)
  return res.status(200).json({
    success: true,
    message: 'Icons fetched successfully',
    data: {
      query: params.q || '',
      category: params.category || null,
      categories: listIconCategories(),
      ...result,
    },
  })
})

export default router
