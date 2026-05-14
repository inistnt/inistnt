// ═══════════════════════════════════════════════════════════════════
// INISTNT — Training Repository
// ═══════════════════════════════════════════════════════════════════

import { db } from '../../infrastructure/database';

export const trainingRepo = {

  // ─── COURSES (Admin CRUD) ─────────────────────────────────────
  getAllCourses: async (params: { category?: string; isRequired?: boolean; isActive?: boolean; page?: number; limit?: number }) => {
    const { category, isRequired, isActive, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (category !== undefined)  where.category  = category;
    if (isRequired !== undefined) where.isRequired = isRequired;
    if (isActive !== undefined)  where.isActive   = isActive;

    const [items, total] = await Promise.all([
      db.trainingCourse.findMany({
        where,
        include: { _count: { select: { lessons: true, enrollments: true } } },
        orderBy: [{ isRequired: 'desc' }, { createdAt: 'desc' }],
        skip, take: limit,
      }),
      db.trainingCourse.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  getCourseById: async (courseId: string) => {
    return db.trainingCourse.findUnique({
      where:   { id: courseId },
      include: { lessons: { orderBy: { order: 'asc' } } },
    });
  },

  createCourse: async (data: any, createdById: string) => {
    const course = await db.trainingCourse.create({
      data: { ...data, createdById },
    });
    return course;
  },

  updateCourse: async (courseId: string, data: any) => {
    return db.trainingCourse.update({ where: { id: courseId }, data });
  },

  deleteCourse: async (courseId: string) => {
    return db.trainingCourse.update({ where: { id: courseId }, data: { isActive: false } });
  },

  // ─── LESSONS ──────────────────────────────────────────────────
  addLesson: async (courseId: string, data: any) => {
    const lastLesson = await db.trainingLesson.findFirst({
      where:   { courseId },
      orderBy: { order: 'desc' },
      select:  { order: true },
    });
    const order = (lastLesson?.order ?? 0) + 1;

    const [lesson] = await db.$transaction([
      db.trainingLesson.create({ data: { ...data, courseId, order } }),
      db.trainingCourse.update({
        where: { id: courseId },
        data:  {
          totalLessons:  { increment: 1 },
          estimatedMins: { increment: Math.ceil((data.durationSeconds ?? 0) / 60) },
        },
      }),
    ]);
    return lesson;
  },

  updateLesson: async (lessonId: string, data: any) => {
    return db.trainingLesson.update({ where: { id: lessonId }, data });
  },

  deleteLesson: async (lessonId: string) => {
    const lesson = await db.trainingLesson.findUnique({ where: { id: lessonId }, select: { courseId: true, durationSeconds: true } });
    if (!lesson) return null;

    await db.$transaction([
      db.trainingLesson.delete({ where: { id: lessonId } }),
      db.trainingCourse.update({
        where: { id: lesson.courseId },
        data:  {
          totalLessons:  { decrement: 1 },
          estimatedMins: { decrement: Math.ceil((lesson.durationSeconds ?? 0) / 60) },
        },
      }),
    ]);
    return { deleted: true };
  },

  // ─── WORKER ENROLLMENT ────────────────────────────────────────
  enrollWorker: async (workerId: string, courseId: string) => {
    return db.workerTrainingEnrollment.upsert({
      where:  { workerId_courseId: { workerId, courseId } },
      create: { workerId, courseId, status: 'enrolled', startedAt: new Date() },
      update: { status: 'enrolled', startedAt: new Date() }, // Re-enroll if previously failed
    });
  },

  getWorkerEnrollments: async (workerId: string) => {
    return db.workerTrainingEnrollment.findMany({
      where:   { workerId },
      include: {
        course:      { select: { title: true, category: true, totalLessons: true, passingScore: true, thumbnailUrl: true } },
        certificate: { select: { certificateNo: true, issuedAt: true, expiresAt: true, pdfUrl: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  },

  getEnrollment: async (workerId: string, courseId: string) => {
    return db.workerTrainingEnrollment.findUnique({
      where:   { workerId_courseId: { workerId, courseId } },
      include: { course: { include: { lessons: { orderBy: { order: 'asc' } } } } },
    });
  },

  markLessonComplete: async (workerId: string, courseId: string, lessonOrder: number) => {
    const enrollment = await db.workerTrainingEnrollment.findUnique({
      where:   { workerId_courseId: { workerId, courseId } },
      include: { course: { select: { totalLessons: true } } },
    });
    if (!enrollment) throw new Error('Enrollment not found');

    const completed = Array.from(new Set([...enrollment.completedLessons, lessonOrder]));
    const status    = completed.length >= (enrollment.course?.totalLessons ?? 0) && !enrollment.course
      ? 'in_progress'
      : completed.length > 0 ? 'in_progress' : 'enrolled';

    return db.workerTrainingEnrollment.update({
      where: { workerId_courseId: { workerId, courseId } },
      data:  { completedLessons: completed, status, lastLessonId: String(lessonOrder) },
    });
  },

  // Submit quiz and potentially complete course
  submitQuiz: async (workerId: string, courseId: string, lessonId: string, answers: Record<string, string>) => {
    const lesson = await db.trainingLesson.findUnique({
      where:  { id: lessonId },
      select: { quizData: true, courseId: true },
    });
    if (!lesson || lesson.courseId !== courseId) throw new Error('Lesson not found');

    const questions = (lesson.quizData as any[]) ?? [];
    if (!questions.length) return { score: 100, passed: true, results: [] };

    let correct = 0;
    const results = questions.map((q: any) => {
      const isCorrect = answers[q.id] === q.correctOptionId;
      if (isCorrect) correct++;
      return { questionId: q.id, isCorrect, correctOptionId: q.correctOptionId, explanation: q.explanation };
    });

    const score = Math.round((correct / questions.length) * 100);

    const course = await db.trainingCourse.findUnique({
      where:  { id: courseId },
      select: { passingScore: true, totalLessons: true },
    });
    const passed = score >= (course?.passingScore ?? 70);

    // Update enrollment
    const enrollment = await db.workerTrainingEnrollment.findUnique({
      where:  { workerId_courseId: { workerId, courseId } },
      select: { completedLessons: true, attempts: true },
    });

    const newStatus = passed ? 'completed' : 'failed';
    const updated   = await db.workerTrainingEnrollment.update({
      where: { workerId_courseId: { workerId, courseId } },
      data:  {
        quizScore:   score,
        status:      newStatus,
        attempts:    { increment: 1 },
        completedAt: passed ? new Date() : null,
      },
    });

    return { score, passed, results, enrollment: updated };
  },

  // ─── CERTIFICATES ─────────────────────────────────────────────
  issueCertificate: async (workerId: string, courseId: string) => {
    const enrollment = await db.workerTrainingEnrollment.findUnique({
      where: { workerId_courseId: { workerId, courseId } },
    });
    if (!enrollment || enrollment.status !== 'completed') throw new Error('Course not completed');

    // Check if certificate already exists
    const existing = await db.workerCertificate.findUnique({
      where: { enrollmentId: enrollment.id },
    });
    if (existing) return existing;

    const year        = new Date().getFullYear();
    const seq         = Math.floor(Math.random() * 900000) + 100000;
    const certificateNo = `INI-${year}-${seq}`;

    // Expiry: 2 years from now
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 2);

    return db.workerCertificate.create({
      data: {
        workerId,
        courseId,
        enrollmentId: enrollment.id,
        certificateNo,
        expiresAt,
      },
    });
  },

  getWorkerCertificates: async (workerId: string) => {
    return db.workerCertificate.findMany({
      where:   { workerId },
      include: { course: { select: { title: true, category: true } } },
      orderBy: { issuedAt: 'desc' },
    });
  },

  // ─── ADMIN ANALYTICS ──────────────────────────────────────────
  getCourseStats: async (courseId: string) => {
    const [enrolled, completed, failed, avgScore] = await Promise.all([
      db.workerTrainingEnrollment.count({ where: { courseId } }),
      db.workerTrainingEnrollment.count({ where: { courseId, status: 'completed' } }),
      db.workerTrainingEnrollment.count({ where: { courseId, status: 'failed' } }),
      db.workerTrainingEnrollment.aggregate({
        where: { courseId, quizScore: { not: null } },
        _avg: { quizScore: true },
      }),
    ]);
    return {
      enrolled,
      completed,
      failed,
      inProgress:     enrolled - completed - failed,
      completionRate: enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0,
      avgQuizScore:   Math.round(avgScore._avg.quizScore ?? 0),
    };
  },

  // Required courses pending for a worker
  getPendingRequiredCourses: async (workerId: string) => {
    const required = await db.trainingCourse.findMany({
      where: { isRequired: true, isActive: true },
      select: { id: true, title: true, category: true, estimatedMins: true },
    });

    const completed = await db.workerTrainingEnrollment.findMany({
      where:  { workerId, status: 'completed', courseId: { in: required.map(c => c.id) } },
      select: { courseId: true },
    });

    const completedIds = new Set(completed.map(e => e.courseId));
    return required.filter(c => !completedIds.has(c.id));
  },
};
