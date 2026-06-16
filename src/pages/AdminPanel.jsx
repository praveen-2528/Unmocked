import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { Shield, Users, History, Database, Trash2, RefreshCw, AlertTriangle, ArrowLeft, Search, BarChart3, Clock, Play, UserX, FileText, Upload, FileUp } from 'lucide-react';
import './AdminPanel.css';
import UserProfileModal from '../components/UserProfileModal';

const AdminPanel = () => {
    const { user, loading: authLoading, authFetch } = useAuth();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState('users');
    const [users, setUsers] = useState([]);
    const [histories, setHistories] = useState([]);
    const [systemInfo, setSystemInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Search and filter states
    const [userSearch, setUserSearch] = useState('');
    const [historySearch, setHistorySearch] = useState('');
    const [globalDeleteCode, setGlobalDeleteCode] = useState('');
    const [activeProfileQuery, setActiveProfileQuery] = useState(null);

    // Shared Documents state variables
    const [documents, setDocuments] = useState([]);
    const [docTitle, setDocTitle] = useState('');
    const [docNotes, setDocNotes] = useState('');
    const [docFile, setDocFile] = useState(null);
    const [docSearch, setDocSearch] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Load admin data
    const fetchAdminData = async () => {
        if (!user || user.role !== 'admin') return;
        setLoading(true);
        setError('');
        try {
            // Fetch users
            const usersRes = await authFetch('/api/admin/users');
            const usersData = await usersRes.json();
            if (usersRes.ok) setUsers(usersData.users || []);

            // Fetch histories
            const histRes = await authFetch('/api/admin/history');
            const histData = await histRes.json();
            if (histRes.ok) setHistories(histData.history || []);

            // Fetch system stats
            const infoRes = await authFetch('/api/admin/info');
            const infoData = await infoRes.json();
            if (infoRes.ok) setSystemInfo(infoData);

            // Fetch documents
            const docsRes = await authFetch('/api/documents');
            const docsData = await docsRes.json();
            if (docsRes.ok) setDocuments(docsData.documents || []);
        } catch (err) {
            setError('Failed to fetch admin data: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAdminData();
    }, [user]);

    // Redirect non-admins
    if (authLoading) {
        return <div className="loading-screen"><div className="loading-spinner" /></div>;
    }
    if (!user || user.role !== 'admin') {
        return <Navigate to="/" replace />;
    }

    // Handlers
    const handleDeleteUser = async (id, email) => {
        if (email === user.email) {
            setError('You cannot delete your own admin account.');
            return;
        }
        if (!window.confirm(`Are you sure you want to permanently delete user ${email}? This action will delete all their test history, custom questions, and friends listings!`)) {
            return;
        }

        setError('');
        setSuccess('');
        try {
            const res = await authFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                setSuccess(`User ${email} deleted successfully.`);
                setUsers(prev => prev.filter(u => u.id !== id));
                // Update system stats
                fetchAdminData();
            } else {
                setError(data.error || 'Failed to delete user.');
            }
        } catch (err) {
            setError('Error: ' + err.message);
        }
    };

    const handleDeleteHistory = async (id) => {
        if (!window.confirm('Are you sure you want to delete this specific test history record?')) {
            return;
        }

        setError('');
        setSuccess('');
        try {
            const res = await authFetch(`/api/admin/history/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                setSuccess('Test history record deleted.');
                setHistories(prev => prev.filter(h => h.id !== id));
                fetchAdminData();
            } else {
                setError(data.error || 'Failed to delete history record.');
            }
        } catch (err) {
            setError('Error: ' + err.message);
        }
    };

    const handleGlobalDelete = async (e) => {
        e.preventDefault();
        const code = globalDeleteCode.trim().toUpperCase();
        if (!code) {
            setError('Please enter a test serial code (e.g. TS-1002).');
            return;
        }

        if (!window.confirm(`⚠️ WARNING: You are about to delete test history GLOBALLY for test code ${code} across ALL users. This cannot be undone! Proceed?`)) {
            return;
        }

        setError('');
        setSuccess('');
        try {
            const res = await authFetch(`/api/admin/history/global/${code}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                setSuccess(`Successfully deleted ${data.count} history records matching test code ${code}.`);
                setHistories(prev => prev.filter(h => h.testCode !== code));
                setGlobalDeleteCode('');
                fetchAdminData();
            } else {
                setError(data.error || 'Failed to delete global records.');
            }
        } catch (err) {
            setError('Error: ' + err.message);
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setDocFile(e.target.files[0]);
            if (!docTitle) {
                const nameParts = e.target.files[0].name.split('.');
                if (nameParts.length > 1) nameParts.pop();
                setDocTitle(nameParts.join('.'));
            }
        }
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setDocFile(e.dataTransfer.files[0]);
            if (!docTitle) {
                const nameParts = e.dataTransfer.files[0].name.split('.');
                if (nameParts.length > 1) nameParts.pop();
                setDocTitle(nameParts.join('.'));
            }
        }
    };

    const handleUploadDoc = async (e) => {
        e.preventDefault();
        if (!docFile || !docTitle.trim()) {
            setError('Please provide a document title and select a file.');
            return;
        }

        setError('');
        setSuccess('');
        setUploading(true);

        try {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64Data = reader.result;
                
                const payload = {
                    title: docTitle.trim(),
                    notes: docNotes.trim(),
                    filename: docFile.name,
                    fileType: docFile.type || 'application/octet-stream',
                    fileSize: docFile.size,
                    fileData: base64Data
                };

                try {
                    const res = await authFetch('/api/admin/documents', {
                        method: 'POST',
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();
                    if (res.ok) {
                        setSuccess(`Document "${payload.title}" uploaded successfully!`);
                        setDocTitle('');
                        setDocNotes('');
                        setDocFile(null);
                        // Refresh documents
                        const updatedDocsRes = await authFetch('/api/documents');
                        const updatedDocsData = await updatedDocsRes.json();
                        if (updatedDocsRes.ok) setDocuments(updatedDocsData.documents || []);
                    } else {
                        setError(data.error || 'Failed to upload document.');
                    }
                } catch (err) {
                    setError('Error uploading document: ' + err.message);
                } finally {
                    setUploading(false);
                }
            };
            reader.onerror = () => {
                setError('Failed to read selected file.');
                setUploading(false);
            };
            reader.readAsDataURL(docFile);
        } catch (err) {
            setError('Error: ' + err.message);
            setUploading(false);
        }
    };

    const handleDeleteDoc = async (id, title) => {
        if (!window.confirm(`Are you sure you want to permanently delete document "${title}"?`)) {
            return;
        }

        setError('');
        setSuccess('');
        try {
            const res = await authFetch(`/api/admin/documents/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                setSuccess(`Document "${title}" deleted successfully.`);
                setDocuments(prev => prev.filter(d => d.id !== id));
            } else {
                setError(data.error || 'Failed to delete document.');
            }
        } catch (err) {
            setError('Error: ' + err.message);
        }
    };

    // Filters
    const filteredUsers = users.filter(u => 
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.role.toLowerCase().includes(userSearch.toLowerCase())
    );

    const filteredHistories = histories.filter(h => 
        h.userName.toLowerCase().includes(historySearch.toLowerCase()) ||
        h.userEmail.toLowerCase().includes(historySearch.toLowerCase()) ||
        (h.testCode && h.testCode.toLowerCase().includes(historySearch.toLowerCase())) ||
        (h.examType && h.examType.toLowerCase().includes(historySearch.toLowerCase()))
    );

    const filteredDocuments = documents.filter(d => 
        d.title.toLowerCase().includes(docSearch.toLowerCase()) ||
        (d.notes && d.notes.toLowerCase().includes(docSearch.toLowerCase())) ||
        d.filename.toLowerCase().includes(docSearch.toLowerCase())
    );

    return (
        <div className="admin-container animate-fade-in">
            {/* Header */}
            <header className="admin-header glass">
                <div className="admin-header-left">
                    <Button variant="ghost" onClick={() => navigate('/')} className="back-btn">
                        <ArrowLeft size={16} /> Back to Dashboard
                    </Button>
                    <div className="admin-title">
                        <Shield size={24} className="shield-icon" />
                        <h1>Admin Panel</h1>
                    </div>
                </div>
                <div className="admin-header-right">
                    <button className="refresh-btn btn btn-ghost" onClick={fetchAdminData} disabled={loading}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <span className="admin-badge">System Administrator</span>
                </div>
            </header>

            {/* Notification toasts */}
            {error && <div className="admin-alert error animate-slide-in-right"><AlertTriangle size={18} /> {error}</div>}
            {success && <div className="admin-alert success animate-slide-in-right">🎉 {success}</div>}

            {/* Tab navigation */}
            <div className="admin-tabs-bar glass">
                <button 
                    className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('users'); setError(''); setSuccess(''); }}
                >
                    <Users size={16} /> Users Management ({users.length})
                </button>
                <button 
                    className={`admin-tab ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('history'); setError(''); setSuccess(''); }}
                >
                    <History size={16} /> Test Histories ({histories.length})
                </button>
                <button 
                    className={`admin-tab ${activeTab === 'system' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('system'); setError(''); setSuccess(''); }}
                >
                    <BarChart3 size={16} /> System Info & Stats
                </button>
                <button 
                    className={`admin-tab ${activeTab === 'documents' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('documents'); setError(''); setSuccess(''); }}
                >
                    <FileText size={16} /> Shared Documents ({documents.length})
                </button>
            </div>

            {/* Main Content Area */}
            <div className="admin-content">
                {activeTab === 'users' && (
                    <Card className="admin-card glass">
                        <div className="card-header-row">
                            <h3>👥 Registered Users</h3>
                            <div className="search-bar">
                                <Search size={16} className="search-icon" />
                                <input 
                                    type="text" 
                                    placeholder="Search by name, email or role..."
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="table-responsive">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>User Profile</th>
                                        <th>Role</th>
                                        <th>Registered Date</th>
                                        <th>Tests Taken</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="empty-table-row">No users found.</td>
                                        </tr>
                                    ) : (
                                        filteredUsers.map(u => (
                                            <tr key={u.id} className={u.email === user.email ? 'current-user-row' : ''}>
                                                <td>{u.id}</td>
                                                <td>
                                                    <div 
                                                        className="user-profile-cell"
                                                        style={{ cursor: 'pointer' }}
                                                        onClick={() => setActiveProfileQuery({ email: u.email, name: u.name })}
                                                        title={`Click to view ${u.name}'s profile & stats`}
                                                    >
                                                        <span className="user-name" style={{ textDecoration: 'underline' }}>{u.name}</span>
                                                        <span className="user-email">{u.email}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`role-badge ${u.role}`}>
                                                        {u.role.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                                                <td><strong>{u.test_count || 0}</strong> tests</td>
                                                <td>
                                                    {u.email !== user.email ? (
                                                        <button 
                                                            className="delete-action-btn"
                                                            onClick={() => handleDeleteUser(u.id, u.email)}
                                                            title="Delete User & History"
                                                        >
                                                            <UserX size={16} /> Delete
                                                        </button>
                                                    ) : (
                                                        <span className="current-user-badge">You</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}

                {activeTab === 'history' && (
                    <div className="history-tab-layout">
                        {/* Global Deletion Card */}
                        <Card className="admin-card global-delete-card glass">
                            <h3>⚠️ Global History Alteration</h3>
                            <p className="hint">
                                If you made a mistakes seeding a test paper or want to reset a multiplayer test results collectively, enter the shared test code code (e.g. <code>TS-1015</code>) below to wipe its history from all participants.
                            </p>
                            <form onSubmit={handleGlobalDelete} className="global-delete-form">
                                <input 
                                    type="text" 
                                    placeholder="Enter Test Serial Code (e.g. TS-1002)"
                                    value={globalDeleteCode}
                                    onChange={(e) => setGlobalDeleteCode(e.target.value)}
                                    className="global-delete-input"
                                />
                                <Button variant="danger" type="submit">
                                    <Trash2 size={16} /> Delete Globally from All Users
                                </Button>
                            </form>
                        </Card>

                        {/* History Records List */}
                        <Card className="admin-card glass">
                            <div className="card-header-row">
                                <h3>📋 All Completed Tests History</h3>
                                <div className="search-bar">
                                    <Search size={16} className="search-icon" />
                                    <input 
                                        type="text" 
                                        placeholder="Search by player, exam, serial..."
                                        value={historySearch}
                                        onChange={(e) => setHistorySearch(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="table-responsive">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Code</th>
                                            <th>User Info</th>
                                            <th>Exam / Format</th>
                                            <th>Score</th>
                                            <th>Time Spent</th>
                                            <th>Date</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredHistories.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="empty-table-row">No history records found.</td>
                                            </tr>
                                        ) : (
                                            filteredHistories.map(h => {
                                                const percentage = h.percentage !== undefined ? h.percentage : ((h.score / h.total) * 100);
                                                const totalMinutes = Math.floor(h.totalTime / 60);
                                                const totalSeconds = h.totalTime % 60;
                                                return (
                                                    <tr key={h.id}>
                                                        <td>
                                                            <span className="serial-badge">{h.testCode || 'N/A'}</span>
                                                        </td>
                                                        <td>
                                                            <div 
                                                                className="user-profile-cell"
                                                                style={{ cursor: 'pointer' }}
                                                                onClick={() => setActiveProfileQuery({ email: h.userEmail, name: h.userName })}
                                                                title={`Click to view ${h.userName}'s profile & stats`}
                                                            >
                                                                <span className="user-name" style={{ textDecoration: 'underline' }}>{h.userName}</span>
                                                                <span className="user-email">{h.userEmail}</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="exam-format-cell">
                                                                <span className="exam-type">{h.examType.toUpperCase()}</span>
                                                                <span className="test-format">{h.testFormat.replace('-', ' ')}</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className="score-percentage-cell">
                                                                <strong>{h.score}</strong>/{h.total} ({percentage.toFixed(0)}%)
                                                            </span>
                                                        </td>
                                                        <td>{totalMinutes}m {totalSeconds}s</td>
                                                        <td>{new Date(h.date).toLocaleDateString()} {new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                        <td>
                                                            <button 
                                                                className="delete-action-btn icon-only"
                                                                onClick={() => handleDeleteHistory(h.id)}
                                                                title="Delete Single Record"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                )}

                {activeTab === 'system' && (
                    <div className="system-stats-grid">
                        <Card className="admin-card stats-summary-card glass">
                            <h3>📈 System Performance Metrics</h3>
                            <div className="metrics-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
                                <div className="metric-box glass">
                                    <span className="metric-label">Total Users</span>
                                    <span className="metric-value">{systemInfo?.stats?.totalUsers || 0}</span>
                                </div>
                                <div className="metric-box glass">
                                    <span className="metric-label">Tests Completed</span>
                                    <span className="metric-value">{systemInfo?.stats?.totalTests || 0}</span>
                                </div>
                                <div className="metric-box glass">
                                    <span className="metric-label">Average Score</span>
                                    <span className="metric-value">{systemInfo?.stats?.avgPercentage || 0}%</span>
                                </div>
                                <div className="metric-box glass">
                                    <span className="metric-label">Database Size</span>
                                    <span className="metric-value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        <Database size={16} /> {systemInfo?.stats?.dbSizeMb || 0} MB
                                    </span>
                                </div>
                            </div>
                        </Card>

                        <Card className="admin-card glass">
                            <h3>🟢 Active Multiplayer Rooms ({systemInfo?.activeRooms?.length || 0})</h3>
                            <div className="table-responsive" style={{ marginTop: '1.25rem' }}>
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Room Code</th>
                                            <th>Host Name</th>
                                            <th>Active Players</th>
                                            <th>Exam Template</th>
                                            <th>Mode</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {!systemInfo?.activeRooms || systemInfo.activeRooms.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="empty-table-row">No multiplayer sessions currently active.</td>
                                            </tr>
                                        ) : (
                                            systemInfo.activeRooms.map(r => (
                                                <tr key={r.code}>
                                                    <td><strong>{r.code}</strong></td>
                                                    <td>{r.hostName}</td>
                                                    <td>{r.participantsCount} participants</td>
                                                    <td>{r.examType.toUpperCase()}</td>
                                                    <td><span className={`mode-badge ${r.roomMode}`}>{r.roomMode}</span></td>
                                                    <td>
                                                        <span className={`status-badge-inline ${r.started ? 'live' : 'waiting'}`} style={{
                                                            fontSize: '0.75rem',
                                                            padding: '0.2rem 0.5rem',
                                                            borderRadius: '4px',
                                                            background: r.started ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                            color: r.started ? '#34d399' : '#f87171',
                                                            fontWeight: 'bold'
                                                        }}>
                                                            {r.started ? '⚡ Running' : '⏳ Lobby'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                )}

                {activeTab === 'documents' && (
                    <div className="documents-tab-layout">
                        {/* Left Side: Upload form */}
                        <Card className="admin-card doc-upload-card glass">
                            <h3>📤 Upload New Document</h3>
                            <p className="hint">
                                Upload reference notes, formula sheets, answer keys, or study materials for all users to see and download.
                            </p>
                            <form onSubmit={handleUploadDoc} className="doc-upload-form">
                                <div className="form-group">
                                    <label className="doc-form-label">Document Title</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. SSC CGL General Studies Formula Sheet"
                                        value={docTitle}
                                        onChange={(e) => setDocTitle(e.target.value)}
                                        required
                                        className="doc-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="doc-form-label">Notes / Description (Optional)</label>
                                    <textarea 
                                        placeholder="Add context, instructions or description..."
                                        value={docNotes}
                                        onChange={(e) => setDocNotes(e.target.value)}
                                        rows={3}
                                        className="doc-textarea"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="doc-form-label">File Upload</label>
                                    <div 
                                        className={`dropzone-container ${dragActive ? 'drag-active' : ''} ${docFile ? 'has-file' : ''}`}
                                        onDragEnter={handleDrag}
                                        onDragOver={handleDrag}
                                        onDragLeave={handleDrag}
                                        onDrop={handleDrop}
                                        onClick={() => document.getElementById('admin-file-input').click()}
                                    >
                                        <input 
                                            id="admin-file-input"
                                            type="file" 
                                            onChange={handleFileChange}
                                            style={{ display: 'none' }}
                                        />
                                        {docFile ? (
                                            <div className="file-info-container">
                                                <FileUp size={40} className="file-icon-pulse" />
                                                <span className="filename-text">{docFile.name}</span>
                                                <span className="filesize-text">{(docFile.size / 1024).toFixed(1)} KB</span>
                                                <button 
                                                    type="button" 
                                                    className="clear-file-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDocFile(null);
                                                    }}
                                                >
                                                    Remove File
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="dropzone-prompt">
                                                <Upload size={32} className="upload-icon-style" />
                                                <p className="primary-text">Drag and drop file here</p>
                                                <p className="secondary-text">or click to browse from files</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Button 
                                    type="submit" 
                                    variant="primary" 
                                    className="w-full flex-center gap-2 upload-submit-btn"
                                    disabled={uploading}
                                >
                                    {uploading ? (
                                        <>
                                            <RefreshCw size={14} className="animate-spin" /> Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={14} /> Upload Document
                                        </>
                                    )}
                                </Button>
                            </form>
                        </Card>

                        {/* Right Side: Document List */}
                        <Card className="admin-card doc-list-card glass">
                            <div className="card-header-row">
                                <h3>📂 Shared Materials Repository</h3>
                                <div className="search-bar">
                                    <Search size={16} className="search-icon" />
                                    <input 
                                        type="text" 
                                        placeholder="Search documents..."
                                        value={docSearch}
                                        onChange={(e) => setDocSearch(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="table-responsive">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Title & Notes</th>
                                            <th>File Information</th>
                                            <th>Upload Date</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDocuments.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="empty-table-row">No documents found.</td>
                                            </tr>
                                        ) : (
                                            filteredDocuments.map(d => (
                                                <tr key={d.id}>
                                                    <td style={{ maxWidth: '300px' }}>
                                                        <div className="doc-details-cell">
                                                            <strong className="doc-title-bold">{d.title}</strong>
                                                            {d.notes && <p className="doc-notes-text">{d.notes}</p>}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="doc-file-cell">
                                                            <div className="doc-file-meta">
                                                                <FileText size={16} className="text-indigo-400" />
                                                                <span className="doc-filename" title={d.filename}>{d.filename}</span>
                                                            </div>
                                                            <span className="doc-size">{(d.file_size / 1024).toFixed(1)} KB</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="doc-date-cell">
                                                            <span>{new Date(d.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                            <span className="uploader-name">by {d.uploader_name}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <button 
                                                            className="delete-action-btn"
                                                            onClick={() => handleDeleteDoc(d.id, d.title)}
                                                            title="Delete Document"
                                                        >
                                                            <Trash2 size={16} /> Delete
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
            {activeProfileQuery && (
                <UserProfileModal 
                    queryEmail={activeProfileQuery.email}
                    queryName={activeProfileQuery.name}
                    onClose={() => setActiveProfileQuery(null)}
                />
            )}
        </div>
    );
};

export default AdminPanel;
