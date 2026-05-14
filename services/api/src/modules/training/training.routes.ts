// ═══════════════════════════════════════════════════════════════════
// INISTNT — Training Routes
//
// Worker Routes  → /api/v1/training/...
// Admin Routes   → /api/v1/admin/training/...
//
// Flow:
//   1. Admin creates course + lessons (with quizzes as JSON)
//   2. Worker enrolls → watches videos → marks lessons done
//   3. Worker takes quiz → if passed → certificate auto-issued
//   4. Required courses must be done before worker can accept jobs
// ═══════════════════════════════════════════════════════════════════

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireWorker, requireStaff, requirePermission } from '../../plugins/auth.middleware';
import { trainingRepo } from './training.repository';

function wrap(fn: Function) {
  return async (req: any, rep: any) => {
    try { return await fn(req, rep); }
    catch (err: any) {
      if (err.statusCode) return rep.status(err.statusCode).send({ success: false, error: { code: err.code, message: err.message } });
      req.log?.error(err);
      return rep.status(500).send({ success: false, error: { code: 'SERVER_ERROR', message: err.message ?? 'Kuch gadbad ho gayi.' } });
    }
  };
}

// ─── WORKER CONTROLLERS ──────────────────────────────────────────────────────

// GET /training/courses — all active courses with worker's enrollment status
async function listCoursesForWorker(req: FastifyRequest, rep: FastifyReply) {
  const workerId = (req as any).currentUser.id;
  const q        = req.query as any;
  const data     = await trainingRepo.getAllCourses({ isActive: true, category: q.category });

  // Attach worker's enrollment status to each course
  const enrollments = await trainingRepo.getWorkerEnrollments(workerId);
  const enrollMap   = Object.fromEntries(enrollments.map(e => [e.courseId, e]));

  const courses = data.items.map(c => ({
    ...c,
    enrollment: enrollMap[c.id] ?? null,
  }));

  return rep.send({ success: true, data: courses });
}

// GET /training/courses/:courseId — full course with lessons + my progress
async function getCourseForWorker(req: FastifyRequest, rep: FastifyReply) {
  const { courseId } = req.params as any;
  const workerId     = (req as any).currentUser.id;

  const [course, enrollment] = await Promise.all([
    trainingRepo.getCourseById(courseId),
    trainingRepo.getEnrollment(workerId, courseId),
  ]);
  if (!course) return rep.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Course nahi mila' } });

  // Strip quiz answers from lessons (only show questions)
  const safeLessons = course.lessons.map((l: any) => ({
    ...l,
    quizData: l.quizData
      ? (l.quizData as any[]).map(q => ({ id: q.id, question: q.question, options: q.options }))
      : null,
  }));

  return rep.send({ success: true, data: { ...course, lessons: safeLessons, enrollment } });
}

// POST /training/courses/:courseId/enroll
async function enrollInCourse(req: FastifyRequest, rep: FastifyReply) {
  const { courseId } = req.params as any;
  const workerId     = (req as any).currentUser.id;
  const data         = await trainingRepo.enrollWorker(workerId, courseId);
  return rep.status(201).send({ success: true, data });
}

// PATCH /training/enrollments/:courseId/progress — mark lesson complete
async function markLessonDone(req: FastifyRequest, rep: FastifyReply) {
  const { courseId }   = req.params as any;
  const { lessonOrder } = req.body as any;
  const workerId        = (req as any).currentUser.id;

  if (!lessonOrder) return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'lessonOrder required' } });
  const data = await trainingRepo.markLessonComplete(workerId, courseId, lessonOrder);
  return rep.send({ success: true, data });
}

// POST /training/enrollments/:courseId/quiz — submit quiz answers
async function submitQuiz(req: FastifyRequest, rep: FastifyReply) {
  const { courseId }         = req.params as any;
  const { lessonId, answers } = req.body as any;
  const workerId              = (req as any).currentUser.id;

  if (!lessonId || !answers) return rep.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'lessonId, answers required' } });

  const result = await trainingRepo.submitQuiz(workerId, courseId, lessonId, answers);

  // Auto-issue certificate if passed
  if (result.passed) {
    const cert = await trainingRepo.issueCertificate(workerId, courseId);
    return rep.send({ success: true, data: { ...result, certificate: cert } });
  }

  return rep.send({ success: true, data: result });
}

// GET /training/my/enrollments — worker's all enrollments
async function getMyEnrollments(req: FastifyRequest, rep: FastifyReply) {
  const workerId = (req as any).currentUser.id;
  const data     = await trainingRepo.getWorkerEnrollments(workerId);
  return rep.send({ success: true, data });
}

// GET /training/my/certificates — worker's all certificates
async function getMyCertificates(req: FastifyRequest, rep: FastifyReply) {
  const workerId = (req as any).currentUser.id;
  const data     = await trainingRepo.getWorkerCertificates(workerId);
  return rep.send({ success: true, data });
}

// GET /training/my/pending-required — required courses not yet done
async function getPendingRequired(req: FastifyRequest, rep: FastifyReply) {
  const workerId = (req as any).currentUser.id;
  const data     = await trainingRepo.getPendingRequiredCourses(workerId);
  return rep.send({ success: true, data, count: data.length });
}

// ─── ADMIN CONTROLLERS ───────────────────────────────────────────────────────

async function adminListCourses(req: FastifyRequest, rep: FastifyReply) {
  const q    = req.query as any;
  const data = await trainingRepo.getAllCourses({
    category:   q.category,
    isRequired: q.isRequired !== undefined ? q.isRequired === 'true' : undefined,
    isActive:   q.isActive   !== undefined ? q.isActive   === 'true' : undefined,
    page:       q.page  ? parseInt(q.page)  : 1,
    limit:      q.limit ? parseInt(q.limit) : 20,
  });
  return rep.send({ success: true, ...data });
}

async function adminCreateCourse(req: FastifyRequest, rep: FastifyReply) {
  const staffId = (req as any).currentUser.id;
  const data    = await trainingRepo.createCourse(req.body, staffId);
  return rep.status(201).send({ success: true, data });
}

async function adminUpdateCourse(req: FastifyRequest, rep: FastifyReply) {
  const { courseId } = req.params as any;
  const data = await trainingRepo.updateCourse(courseId, req.body);
  return rep.send({ success: true, data });
}

async function adminAddLesson(req: FastifyRequest, rep: FastifyReply) {
  const { courseId } = req.params as any;
  const data = await trainingRepo.addLesson(courseId, req.body);
  return rep.status(201).send({ success: true, data });
}

async function adminUpdateLesson(req: FastifyRequest, rep: FastifyReply) {
  const { lessonId } = req.params as any;
  const data = await trainingRepo.updateLesson(lessonId, req.body);
  return rep.send({ success: true, data });
}

async function adminDeleteLesson(req: FastifyRequest, rep: FastifyReply) {
  const { lessonId } = req.params as any;
  const data = await trainingRepo.deleteLesson(lessonId);
  return rep.send({ success: true, data });
}

async function adminCourseStats(req: FastifyRequest, rep: FastifyReply) {
  const { courseId } = req.params as any;
  const data = await trainingRepo.getCourseStats(courseId);
  return rep.send({ success: true, data });
}

async function adminWorkerCertificates(req: FastifyRequest, rep: FastifyReply) {
  const { workerId } = req.params as any;
  const data = await trainingRepo.getWorkerCertificates(workerId);
  return rep.send({ success: true, data });
}

// ─── ROUTE REGISTRATION ──────────────────────────────────────────────────────

export async function trainingWorkerRoutes(server: FastifyInstance) {
  const auth = [requireWorker];

  server.get('/courses',                              { preHandler: auth }, wrap(listCoursesForWorker));
  server.get('/courses/:courseId',                    { preHandler: auth }, wrap(getCourseForWorker));
  server.post('/courses/:courseId/enroll',            { preHandler: auth }, wrap(enrollInCourse));
  server.patch('/enrollments/:courseId/progress',     { preHandler: auth }, wrap(markLessonDone));
  server.post('/enrollments/:courseId/quiz',          { preHandler: auth }, wrap(submitQuiz));
  server.get('/my/enrollments',                       { preHandler: auth }, wrap(getMyEnrollments));
  server.get('/my/certificates',                      { preHandler: auth }, wrap(getMyCertificates));
  server.get('/my/pending-required',                  { preHandler: auth }, wrap(getPendingRequired));
}

export async function trainingAdminRoutes(server: FastifyInstance) {
  const perm = (p: string) => [requireStaff, requirePermission(p as any)];

  server.get('/courses',                              { preHandler: perm('view:workers')   }, wrap(adminListCourses));
  server.post('/courses',                             { preHandler: perm('manage:workers') }, wrap(adminCreateCourse));
  server.patch('/courses/:courseId',                  { preHandler: perm('manage:workers') }, wrap(adminUpdateCourse));
  server.post('/courses/:courseId/lessons',           { preHandler: perm('manage:workers') }, wrap(adminAddLesson));
  server.patch('/lessons/:lessonId',                  { preHandler: perm('manage:workers') }, wrap(adminUpdateLesson));
  server.delete('/lessons/:lessonId',                 { preHandler: perm('manage:workers') }, wrap(adminDeleteLesson));
  server.get('/courses/:courseId/stats',              { preHandler: perm('view:analytics') }, wrap(adminCourseStats));
  server.get('/workers/:workerId/certificates',       { preHandler: perm('view:workers')   }, wrap(adminWorkerCertificates));
}
