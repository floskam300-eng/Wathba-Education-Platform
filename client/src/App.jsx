import React from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LiveStreamProvider } from './context/LiveStreamContext';
import { TeacherWrapper, TeacherNotFound } from './context/TeacherContext';
import { getTenantSlug } from './lib/tenant';
import ScrollRestoration from './components/ui/ScrollRestoration';
const Login = React.lazy(() => import('./pages/Login'));
const PlatformHome = React.lazy(() => import('./pages/PlatformHome'));
const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const TeacherLayout = React.lazy(() => import('./layouts/TeacherLayout'));
const AssistantLayout = React.lazy(() => import('./layouts/AssistantLayout'));
const StudentLayout = React.lazy(() => import('./layouts/StudentLayout'));
const TeacherDashboard = React.lazy(() => import('./pages/teacher/Dashboard'));
const TeacherStudents = React.lazy(() => import('./pages/teacher/Students'));
const TeacherAddStudent = React.lazy(() => import('./pages/teacher/AddStudent'));
const TeacherCourses = React.lazy(() => import('./pages/teacher/Courses'));
const TeacherExams = React.lazy(() => import('./pages/teacher/Exams'));
const TeacherAssistants = React.lazy(() => import('./pages/teacher/Assistants'));
const TeacherAnalytics = React.lazy(() => import('./pages/teacher/Analytics'));
const TeacherPayments = React.lazy(() => import('./pages/teacher/Payments'));
const TeacherLeaderboard = React.lazy(() => import('./pages/teacher/Leaderboard'));
const TeacherNotifications = React.lazy(() => import('./pages/teacher/Notifications'));
const TeacherBackup = React.lazy(() => import('./pages/teacher/Backup'));
const TeacherAttendance = React.lazy(() => import('./pages/teacher/Attendance'));
const TeacherClassAttendance = React.lazy(() => import('./pages/teacher/ClassAttendance'));
const TeacherRequests = React.lazy(() => import('./pages/teacher/Requests'));
const WrongQuestionsPage = React.lazy(() => import('./pages/teacher/WrongQuestions'));
const QuestionBanks = React.lazy(() => import('./pages/teacher/QuestionBanks'));
const TeacherLiveStream = React.lazy(() => import('./pages/teacher/LiveStream'));
const TeacherActivityLog = React.lazy(() => import('./pages/teacher/ActivityLog'));
const CourseContent = React.lazy(() => import('./pages/teacher/CourseContent'));
const ExamQuestions = React.lazy(() => import('./pages/teacher/ExamQuestions'));
const RecitationQuestions = React.lazy(() => import('./pages/teacher/RecitationQuestions'));
const QuestionBankQuestions = React.lazy(() => import('./pages/teacher/QuestionBankQuestions'));
const TeacherSettings = React.lazy(() => import('./pages/teacher/Settings'));
const TeacherRecitations = React.lazy(() => import('./pages/teacher/Recitations'));
const TeacherArchive = React.lazy(() => import('./pages/teacher/Archive'));
const TeacherRetryRequests = React.lazy(() => import('./pages/teacher/RetryRequests'));
const ExamAnalytics = React.lazy(() => import('./pages/teacher/ExamAnalytics'));
const ExamPerformancePage = React.lazy(() => import('./pages/teacher/ExamPerformancePage'));
const AtRiskStudentsPage = React.lazy(() => import('./pages/teacher/AtRiskStudentsPage'));
const StudentRecitations = React.lazy(() => import('./pages/student/Recitations'));
const StudentLiveStream = React.lazy(() => import('./pages/student/LiveStream'));
const AssistantDashboard = React.lazy(() => import('./pages/assistant/Dashboard'));
const AssistantStudents = React.lazy(() => import('./pages/assistant/Students'));
const AssistantExams = React.lazy(() => import('./pages/teacher/Exams'));
const AssistantAnalytics = React.lazy(() => import('./pages/assistant/Analytics'));
const AssistantCourses = React.lazy(() => import('./pages/assistant/Courses'));
const AssistantPayments = React.lazy(() => import('./pages/assistant/Payments'));
const StudentDashboard = React.lazy(() => import('./pages/student/Dashboard'));
const StudentCourses = React.lazy(() => import('./pages/student/Courses'));
const StudentCourseView = React.lazy(() => import('./pages/student/CourseView'));
const StudentExams = React.lazy(() => import('./pages/student/Exams'));
const StudentLeaderboard = React.lazy(() => import('./pages/student/Leaderboard'));
const StudentMyStats = React.lazy(() => import('./pages/student/MyStats'));
const StudentNotifications = React.lazy(() => import('./pages/student/Notifications'));
const StudentEvents = React.lazy(() => import('./pages/student/Events'));
const StickmanRunPage = React.lazy(() => import('./pages/student/games/StickmanRunPage'));
const ExamReviewPage = React.lazy(() => import('./pages/ExamReviewPage'));
const RecitationReviewPage = React.lazy(() => import('./pages/RecitationReviewPage'));
const ParentPortal = React.lazy(() => import('./pages/ParentPortal'));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'));
const TermsAndConditions = React.lazy(() => import('./pages/TermsAndConditions'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));
import OfflineIndicator from './components/ui/OfflineIndicator';

// ─── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || '';
      const stack = this.state.info?.componentStack || '';
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center" dir="rtl">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-2xl w-full text-right">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2 text-center">حدث خطأ غير متوقع</h2>
            {msg && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-left overflow-auto max-h-32">
                <p className="text-red-700 text-xs font-mono break-all">{msg}</p>
              </div>
            )}
            {stack && (
              <details className="mb-4">
                <summary className="text-xs text-gray-500 cursor-pointer mb-1">تفاصيل الخطأ</summary>
                <pre className="bg-gray-100 rounded p-2 text-[10px] text-gray-600 overflow-auto max-h-40 text-left">{stack}</pre>
              </details>
            )}
            <button onClick={() => { this.setState({ hasError: false, error: null, info: null }); }}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-semibold mx-auto transition-colors">
              <RefreshCw className="w-4 h-4" /> محاولة مرة أخرى
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── PWA Root Redirect ───────────────────────────────────────────────────────
// Only active when the app is launched as an installed PWA (standalone mode).
// • Logged-in user  → goes straight to their dashboard, skipping the landing page
// • Not logged in   → goes straight to /login, skipping the landing page
// • Normal browser  → renders the LandingPage as usual
const PwaRootRedirect = () => {
  const { user, loading } = useAuth();

  const isPwa =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  // Normal browser visit → show the landing page
  if (!isPwa) return <LandingPage />;

  // Wait for auth state to resolve before redirecting
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  // Logged in → dashboard
  if (user && user.teacher_slug) return <Navigate to={`/${user.role}`} replace />;

  // Not logged in → login
  return <Navigate to="/login" replace />;
};

// ─── Assistant Permission Route ──────────────────────────────────────────────
const AssistantPermissionRoute = ({ children, permission, anyOf }) => {
  const { user } = useAuth();
  if (user?.role === 'assistant') {
    const hasPermission = anyOf
      ? anyOf.some(p => user[p])
      : (permission ? user[permission] : true);
    if (!hasPermission) return <Navigate to="/assistant" replace />;
  }
  return children;
};

// ─── Protected Route ─────────────────────────────────────────────────────────
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// ─── Tenant Routes (subdomain present) ───────────────────────────────────────
// TeacherWrapper is used as a layout Route element — its internal <Outlet /> renders
// the matched child route. This is the correct React Router v6 "layout route" pattern.
const TenantRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Layout route: TeacherWrapper loads teacher context, shows spinner/error, then <Outlet /> */}
      <Route element={<TeacherWrapper />}>

        <Route index element={<PwaRootRedirect />} />

        <Route path="login"
          element={user && user.teacher_slug ? <Navigate to={`/${user.role}`} replace /> : <Login />} />

        <Route path="parent-portal" element={<ParentPortal />} />

        <Route path="privacy" element={<PrivacyPolicy />} />
        <Route path="terms" element={<TermsAndConditions />} />

        {/* ── Teacher dashboard ─────────────────────────────────────────────── */}
        <Route path="teacher" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <ErrorBoundary><TeacherLayout /></ErrorBoundary>
          </ProtectedRoute>
        }>
          <Route index element={<TeacherDashboard />} />
          <Route path="students" element={<TeacherStudents />} />
          <Route path="students/add" element={<TeacherAddStudent />} />
          <Route path="courses" element={<TeacherCourses />} />
          <Route path="exams" element={<TeacherExams />} />
          <Route path="assistants" element={<TeacherAssistants />} />
          <Route path="analytics" element={<TeacherAnalytics />} />
          <Route path="payments" element={<TeacherPayments />} />
          <Route path="leaderboard" element={<TeacherLeaderboard />} />
          <Route path="notifications" element={<TeacherNotifications />} />
          <Route path="backup" element={<TeacherBackup />} />
          <Route path="attendance" element={<TeacherAttendance />} />
          <Route path="class-attendance" element={<TeacherClassAttendance />} />
          <Route path="requests" element={<TeacherRequests />} />
          <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
          <Route path="recitation-review/:resultId" element={<RecitationReviewPage />} />
          <Route path="wrong-questions" element={<WrongQuestionsPage />} />
          <Route path="question-banks" element={<QuestionBanks />} />
          <Route path="livestream" element={<TeacherLiveStream />} />
          <Route path="activity-log" element={<TeacherActivityLog />} />
          <Route path="courses/:courseId/content" element={<CourseContent />} />
          <Route path="exams/:examId/questions" element={<ExamQuestions />} />
          <Route path="recitations/:recitationId/questions" element={<RecitationQuestions />} />
          <Route path="question-banks/:bankId/questions" element={<QuestionBankQuestions />} />
          <Route path="settings" element={<TeacherSettings />} />
          <Route path="recitations" element={<TeacherRecitations />} />
          <Route path="archive" element={<TeacherArchive />} />
          <Route path="retry-requests" element={<TeacherRetryRequests />} />
          <Route path="exam-analytics/:examId" element={<ExamAnalytics />} />
          <Route path="analytics/exam-performance" element={<ExamPerformancePage />} />
          <Route path="analytics/at-risk" element={<AtRiskStudentsPage />} />
        </Route>

        {/* ── Assistant dashboard ────────────────────────────────────────────── */}
        <Route path="assistant" element={
          <ProtectedRoute allowedRoles={['assistant']}>
            <ErrorBoundary><AssistantLayout /></ErrorBoundary>
          </ProtectedRoute>
        }>
          <Route index element={<AssistantDashboard />} />
          <Route path="students" element={<AssistantStudents />} />
          <Route path="students/add" element={
            <AssistantPermissionRoute permission="can_add_students"><TeacherAddStudent /></AssistantPermissionRoute>
          } />
          <Route path="exams" element={
            <AssistantPermissionRoute permission="can_manage_exams"><AssistantExams /></AssistantPermissionRoute>
          } />
          <Route path="question-banks" element={
            <AssistantPermissionRoute permission="can_manage_exams"><QuestionBanks /></AssistantPermissionRoute>
          } />
          <Route path="courses" element={
            <AssistantPermissionRoute permission="can_manage_courses"><AssistantCourses /></AssistantPermissionRoute>
          } />
          <Route path="payments" element={
            <AssistantPermissionRoute permission="can_manage_payments"><AssistantPayments /></AssistantPermissionRoute>
          } />
          <Route path="analytics" element={
            <AssistantPermissionRoute permission="can_view_analytics"><AssistantAnalytics /></AssistantPermissionRoute>
          } />
          <Route path="notifications" element={
            <AssistantPermissionRoute permission="can_send_notifications"><TeacherNotifications /></AssistantPermissionRoute>
          } />
          <Route path="requests" element={
            <AssistantPermissionRoute anyOf={['can_manage_exams', 'can_manage_courses']}><TeacherRequests /></AssistantPermissionRoute>
          } />
          <Route path="class-attendance" element={
            <AssistantPermissionRoute permission="can_manage_attendance"><TeacherClassAttendance /></AssistantPermissionRoute>
          } />
          <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
          <Route path="recitation-review/:resultId" element={<RecitationReviewPage />} />
          <Route path="courses/:courseId/content" element={
            <AssistantPermissionRoute permission="can_manage_courses"><CourseContent /></AssistantPermissionRoute>
          } />
          <Route path="exams/:examId/questions" element={
            <AssistantPermissionRoute permission="can_manage_exams"><ExamQuestions /></AssistantPermissionRoute>
          } />
          <Route path="recitations/:recitationId/questions" element={
            <AssistantPermissionRoute permission="can_manage_recitations"><RecitationQuestions /></AssistantPermissionRoute>
          } />
          <Route path="question-banks/:bankId/questions" element={
            <AssistantPermissionRoute permission="can_manage_exams"><QuestionBankQuestions /></AssistantPermissionRoute>
          } />
          <Route path="recitations" element={
            <AssistantPermissionRoute permission="can_manage_recitations"><TeacherRecitations /></AssistantPermissionRoute>
          } />
          <Route path="archive" element={
            <AssistantPermissionRoute anyOf={['can_view_analytics', 'can_manage_exams', 'can_manage_recitations']}>
              <TeacherArchive />
            </AssistantPermissionRoute>
          } />
          <Route path="exam-analytics/:examId" element={
            <AssistantPermissionRoute permission="can_view_analytics"><ExamAnalytics /></AssistantPermissionRoute>
          } />
          <Route path="analytics/exam-performance" element={
            <AssistantPermissionRoute permission="can_view_analytics"><ExamPerformancePage /></AssistantPermissionRoute>
          } />
          <Route path="analytics/at-risk" element={
            <AssistantPermissionRoute permission="can_view_analytics"><AtRiskStudentsPage /></AssistantPermissionRoute>
          } />
        </Route>

        {/* ── Student dashboard ─────────────────────────────────────────────── */}
        <Route path="student" element={
          <ProtectedRoute allowedRoles={['student']}>
            <ErrorBoundary><StudentLayout /></ErrorBoundary>
          </ProtectedRoute>
        }>
          <Route index element={<StudentDashboard />} />
          <Route path="courses" element={<StudentCourses />} />
          <Route path="courses/:courseId" element={<StudentCourseView />} />
          <Route path="exams" element={<StudentExams />} />
          <Route path="stats" element={<StudentMyStats />} />
          <Route path="notifications" element={<StudentNotifications />} />
          <Route path="leaderboard" element={<StudentLeaderboard />} />
          <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
          <Route path="recitation-review/:resultId" element={<RecitationReviewPage />} />
          <Route path="live" element={<StudentLiveStream />} />
          <Route path="events" element={<StudentEvents />} />
          <Route path="recitations" element={<StudentRecitations />} />
        </Route>

        {/* Stickman run — fullscreen game, outside StudentLayout intentionally */}
        <Route path="student/events/stickman-run" element={
          <ProtectedRoute allowedRoles={['student']}><StickmanRunPage /></ProtectedRoute>
        } />

        <Route path="*" element={<NotFoundPage />} />

      </Route>
    </Routes>
  );
};

// ─── Main Domain Routes (no subdomain — SaaS landing) ────────────────────────
const MainDomainRoutes = () => (
  <Routes>
    <Route path="/" element={<PlatformHome />} />
    <Route path="/privacy" element={<PrivacyPolicy />} />
    <Route path="/terms" element={<TermsAndConditions />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

// ─── Root Router ──────────────────────────────────────────────────────────────
const AppRoutes = () => {
  const tenantSlug = getTenantSlug();
  // No subdomain / no localStorage slug → show SaaS landing
  if (!tenantSlug) return <MainDomainRoutes />;
  // Subdomain or dev localStorage slug → show tenant app
  return <TenantRoutes />;
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <LiveStreamProvider>
            <React.Suspense fallback={
              <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-[var(--dk-elevated)]">
                <div className="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full" />
              </div>
            }>
              <ScrollRestoration />
              <AppRoutes />
            </React.Suspense>
            <OfflineIndicator />
          </LiveStreamProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
