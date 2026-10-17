import React from 'react';
import {createRoot} from 'react-dom/client';
import TeacherApp from './TeacherApp.jsx';
import './teacher-styles.css';
import './teacher/professional-workspace.css';
import './teacher/workspace-shell.css';
import PageErrorBoundary from './teacher/PageErrorBoundary';
import {TeacherCloudProvider} from './teacher/TeacherCloud';

document.body.classList.add('print-mode-batch', 'teacher-workspace');
createRoot(document.getElementById('root')!).render(<PageErrorBoundary><TeacherCloudProvider><TeacherApp /></TeacherCloudProvider></PageErrorBoundary>);
