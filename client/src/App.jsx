import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LiveStreamProvider } from './context/LiveStreamContext';
import Login from './pages/Login';
import LandingPage from './pages/LandingPage';
import TeacherLayout from './layouts/TeacherLayout';
import AssistantLayout from './layouts/AssistantLayout';
import StudentLayout from './layouts/StudentLayout';
import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherStudents from './pages/teacher/Students';
import TeacherCourses from './pages/teacher/Courses';
import TeacherExams from './pages/teacher/Exams';
import TeacherAssistants from './pages/teacher/Assistants';
import TeacherAnalytics from './pages/teacher/Analytics';
import TeacherPayments from './pages/teacher/Payments';
import TeacherLeaderboard from './pages/teacher/Leaderboard';
import TeacherNotifications from './pages/teacher/Notifications';
import TeacherBackup from './pages/teacher/Backup';
import TeacherAttendance from './pages/teacher/Attendance';
import TeacherRequests from './pages/teacher/Requests';
import WrongQuestionsPage from './pages/teacher/WrongQuestions';
import QuestionBanks from './pages/teacher/QuestionBanks';
import TeacherLiveStream from './pages/teacher/LiveStream';
import StudentLiveStream from './pages/student/LiveStream';
import AssistantDashboard from './pages/assistant/Dashboard';
import AssistantStudents from './pages/assistant/Students';
import AssistantExams from './pages/teacher/Exams';
import AssistantAnalytics from './pages/assistant/Analytics';
import AssistantCourses from './pages/assistant/Courses';
import AssistantPayments from './pages/assistant/Payments';
import StudentDashboard from './pages/student/Dashboard';
import StudentCourses from './pages/student/Courses';
import StudentCourseView from './pages/student/CourseView';
import StudentExams from './pages/student/Exams';
import StudentLeaderboard from './pages/student/Leaderboard';
import StudentMyStats from './pages/student/MyStats';
import StudentNotifications from './pages/student/Notifications';
import StudentEvents from './pages/student/Events';
import StickmanRunPage from './pages/student/games/StickmanRunPage';
import ExamReviewPage from './pages/ExamReviewPage';
import PWAInstallBanner from './components/PWAInstallBanner';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center" dir="rtl">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">حدث خطأ غير متوقع</h2>
            <p className="text-gray-500 text-sm mb-6">يرجى إعادة تحميل الصفحة. إذا استمر الخطأ، تواصل مع الدعم الفني.</p>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-semibold mx-auto transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={`/${user.role}`} replace /> : <Login />} />

      <Route path="/teacher" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherLayout /></ProtectedRoute>}>
        <Route index element={<TeacherDashboard />} />
        <Route path="students" element={<TeacherStudents />} />
        <Route path="courses" element={<TeacherCourses />} />
        <Route path="exams" element={<TeacherExams />} />
        <Route path="assistants" element={<TeacherAssistants />} />
        <Route path="analytics" element={<TeacherAnalytics />} />
        <Route path="payments" element={<TeacherPayments />} />
        <Route path="leaderboard" element={<TeacherLeaderboard />} />
        <Route path="notifications" element={<TeacherNotifications />} />
        <Route path="backup" element={<TeacherBackup />} />
        <Route path="attendance" element={<TeacherAttendance />} />
        <Route path="requests" element={<TeacherRequests />} />
        <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
        <Route path="wrong-questions" element={<WrongQuestionsPage />} />
        <Route path="question-banks" element={<QuestionBanks />} />
        <Route path="livestream" element={<TeacherLiveStream />} />
      </Route>

      <Route path="/assistant" element={<ProtectedRoute allowedRoles={['assistant']}><AssistantLayout /></ProtectedRoute>}>
        <Route index element={<AssistantDashboard />} />
        <Route path="students" element={<AssistantStudents />} />
        <Route path="exams" element={<AssistantExams />} />
        <Route path="courses" element={<AssistantCourses />} />
        <Route path="payments" element={<AssistantPayments />} />
        <Route path="analytics" element={<AssistantAnalytics />} />
        <Route path="notifications" element={<TeacherNotifications />} />
        <Route path="requests" element={<TeacherRequests />} />
        <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
        <Route path="question-banks" element={<QuestionBanks />} />
      </Route>

      <Route path="/student" element={<ProtectedRoute allowedRoles={['student']}><StudentLayout /></ProtectedRoute>}>
        <Route index element={<StudentDashboard />} />
        <Route path="courses" element={<StudentCourses />} />
        <Route path="courses/:courseId" element={<StudentCourseView />} />
        <Route path="exams" element={<StudentExams />} />
        <Route path="stats" element={<StudentMyStats />} />
        <Route path="notifications" element={<StudentNotifications />} />
        <Route path="leaderboard" element={<StudentLeaderboard />} />
        <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
        <Route path="live" element={<StudentLiveStream />} />
        <Route path="events" element={<StudentEvents />} />
      </Route>

      <Route path="/student/events/stickman-run" element={
        <ProtectedRoute allowedRoles={['student']}><StickmanRunPage /></ProtectedRoute>
      } />

      <Route path="/" element={user ? <Navigate to={`/${user.role}`} replace /> : <LandingPage />} />
      <Route path="*" element={<Navigate to={user ? `/${user.role}` : '/'} replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <LiveStreamProvider>
            <AppRoutes />
            <PWAInstallBanner />
          </LiveStreamProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
