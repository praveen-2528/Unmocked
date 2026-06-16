import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { ChevronLeft, Lock, CheckCircle, AlertCircle, User, Mail, Calendar } from 'lucide-react';
import './Settings.css';

const Settings = () => {
    const navigate = useNavigate();
    const { user, setUser, authFetch } = useAuth();
    const [nameInput, setNameInput] = useState(user?.name || '');
    const [emailInput, setEmailInput] = useState(user?.email || '');
    const [nameMsg, setNameMsg] = useState({ type: '', text: '' });
    const [nameLoading, setNameLoading] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (user?.name) {
            setNameInput(user.name);
        }
        if (user?.email) {
            setEmailInput(user.email);
        }
    }, [user]);

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setNameMsg({ type: '', text: '' });

        if (!nameInput.trim()) return setNameMsg({ type: 'error', text: 'Name cannot be empty.' });
        if (!emailInput.trim()) return setNameMsg({ type: 'error', text: 'Email cannot be empty.' });

        setNameLoading(true);
        try {
            const res = await authFetch('/api/auth/profile', {
                method: 'PUT',
                body: JSON.stringify({
                    name: nameInput.trim(),
                    email: emailInput.trim().toLowerCase()
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setUser(prev => ({ ...prev, name: data.name, email: data.email }));
            setNameMsg({ type: 'success', text: 'Profile updated successfully!' });
        } catch (err) {
            setNameMsg({ type: 'error', text: err.message });
        } finally {
            setNameLoading(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setMsg({ type: '', text: '' });

        if (newPassword.length < 6) return setMsg({ type: 'error', text: 'New password must be at least 6 characters.' });
        if (newPassword !== confirmPassword) return setMsg({ type: 'error', text: 'Passwords do not match.' });

        setLoading(true);
        try {
            const res = await authFetch('/api/auth/password', {
                method: 'PUT',
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMsg({ type: 'success', text: 'Password changed successfully!' });
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        } catch (err) {
            setMsg({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="settings-container animate-fade-in">
            <div className="settings-header">
                <h1>⚙️ Settings</h1>
                <p>Manage your account</p>
            </div>

            {/* Profile Card */}
            <Card className="profile-card glass">
                <h3>Profile</h3>
                <form onSubmit={handleUpdateProfile} className="name-form">
                    <div className="profile-fields">
                        <div className="profile-row input-row">
                            <User size={16} />
                            <span className="profile-label">Name</span>
                            <input
                                type="text"
                                value={nameInput}
                                onChange={e => setNameInput(e.target.value)}
                                placeholder="Your display name"
                                required
                            />
                        </div>
                        <div className="profile-row input-row">
                            <Mail size={16} />
                            <span className="profile-label">Email</span>
                            <input
                                type="email"
                                value={emailInput}
                                onChange={e => setEmailInput(e.target.value)}
                                placeholder="Your email address"
                                required
                            />
                        </div>
                        <div className="profile-row">
                            <Calendar size={16} />
                            <span className="profile-label">Joined</span>
                            <span className="profile-value">
                                {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </span>
                        </div>
                    </div>

                    {nameMsg.text && (
                        <div className={`settings-msg ${nameMsg.type}`} style={{ marginTop: '0.75rem' }}>
                            {nameMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                            {nameMsg.text}
                        </div>
                    )}

                    <div style={{ marginTop: '1rem' }}>
                        <Button type="submit" variant="primary" disabled={nameLoading || (nameInput.trim() === user?.name && emailInput.trim().toLowerCase() === user?.email)}>
                            {nameLoading ? 'Saving...' : 'Save Profile'}
                        </Button>
                    </div>
                </form>
            </Card>

            {/* Change Password Card */}
            <Card className="password-card glass">
                <h3><Lock size={18} /> Change Password</h3>
                <form onSubmit={handleChangePassword} className="password-form">
                    <input
                        type="password"
                        placeholder="Current Password"
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder="New Password (min 6 chars)"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        required
                        minLength={6}
                    />
                    <input
                        type="password"
                        placeholder="Confirm New Password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        required
                    />

                    {msg.text && (
                        <div className={`settings-msg ${msg.type}`}>
                            {msg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                            {msg.text}
                        </div>
                    )}

                    <Button type="submit" variant="primary" disabled={loading}>
                        {loading ? 'Changing...' : 'Change Password'}
                    </Button>
                </form>
            </Card>

            <div className="settings-back">
                <Button variant="ghost" onClick={() => navigate('/')}><ChevronLeft size={16} /> Back</Button>
            </div>
        </div>
    );
};

export default Settings;
