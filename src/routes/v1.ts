import { Router } from 'express'
import { validateRequest } from '../middleware/validate.middleware'
import {
  createTextElementSchema,
  editorStatePatchSchema,
  joinSessionSchema,
  mediaListQuerySchema,
  projectAndSceneParamsSchema,
  projectCreateSchema,
  projectIdParamsSchema,
  projectPatchSchema,
  renderIdParamsSchema,
  snapshotSchema,
  upsertSceneSchema
} from '../modules/editor/editor.schemas'
import { EditorController } from '../modules/editor/editor.controller'

export function createV1Router(controller: EditorController): Router {
  const router = Router()

  router.get('/test', (_req, res) => {
    res.status(200).json({
      success: true,
      message: 'API test endpoint is running',
      data: {
        timestamp: new Date().toISOString()
      }
    })
  })

  router.get('/projects', controller.listProjects)
  router.post('/projects', validateRequest({ body: projectCreateSchema }), controller.createProject)
  router.get('/projects/:projectId', validateRequest({ params: projectIdParamsSchema }), controller.getProject)
  router.patch('/projects/:projectId', validateRequest({ params: projectIdParamsSchema, body: projectPatchSchema }), controller.patchProject)

  router.get('/projects/:projectId/editor-state', validateRequest({ params: projectIdParamsSchema }), controller.getEditorState)
  router.patch('/projects/:projectId/editor-state', validateRequest({ params: projectIdParamsSchema, body: editorStatePatchSchema }), controller.patchEditorState)

  router.get('/projects/:projectId/snapshot', validateRequest({ params: projectIdParamsSchema }), controller.getSnapshot)
  router.get('/projects/:projectId/snapshot', validateRequest({ params: projectIdParamsSchema }), controller.getSnapshot)
  router.put('/projects/:projectId/snapshot', validateRequest({ params: projectIdParamsSchema, body: snapshotSchema }), controller.putSnapshot)

  router.get('/projects/:projectId/session', validateRequest({ params: projectIdParamsSchema }), controller.getSession)
  router.post('/projects/:projectId/session/join', validateRequest({ params: projectIdParamsSchema, body: joinSessionSchema }), controller.joinSession)

  router.post('/projects/:projectId/elements', validateRequest({ params: projectIdParamsSchema, body: createTextElementSchema }), controller.createTextElement)

  router.put('/projects/:projectId/scenes/:sceneId', validateRequest({ params: projectAndSceneParamsSchema, body: upsertSceneSchema }), controller.upsertScene)
  router.get('/projects/:projectId/scenes/:sceneId', validateRequest({ params: projectAndSceneParamsSchema }), controller.getScene)

  router.get('/media', validateRequest({ query: mediaListQuerySchema }), controller.listMedia)

  router.get('/renders/:renderId', validateRequest({ params: renderIdParamsSchema }), controller.getRender)
  router.post('/renders/:renderId/cancel', validateRequest({ params: renderIdParamsSchema }), controller.cancelRender)

  return router
}
