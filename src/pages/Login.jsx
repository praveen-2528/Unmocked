import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { LogIn, UserPlus, Mail, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import './Login.css';

const Login = () => {
    const { login, register } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const redirectTo = location.state?.from || '/';
    const [isRegister, setIsRegister] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isRegister) {
                if (!name.trim()) throw new Error('Name is required.');
                await register(name.trim(), email.trim(), password);
            } else {
                await login(email.trim(), password);
            }
            navigate(redirectTo);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container animate-fade-in">
            <div className="login-brand">
                <h1>🎯 Testara</h1>
                <p>Your premium mock-test platform</p>
            </div>

            <Card className="login-card glass">
                <div className="login-tabs">
                    <button
                        className={`tab ${!isRegister ? 'active' : ''}`}
                        onClick={() => { setIsRegister(false); setError(''); }}
                    >
                        <LogIn size={16} /> Login
                    </button>
                    <button
                        className={`tab ${isRegister ? 'active' : ''}`}
                        onClick={() => { setIsRegister(true); setError(''); }}
                    >
                        <UserPlus size={16} /> Register
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    {isRegister && (
                        <div className="form-field">
                            <User size={16} className="field-icon" />
                            <input
                                type="text"
                                placeholder="Full Name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required={isRegister}
                                autoComplete="name"
                            />
                        </div>
                    )}

                    <div className="form-field">
                        <Mail size={16} className="field-icon" />
                        <input
                            type="email"
                            placeholder="Email Address"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-field">
                        <Lock size={16} className="field-icon" />
                        <input
                            type="password"
                            placeholder="Password (min 6 chars)"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={6}
                            autoComplete={isRegister ? 'new-password' : 'current-password'}
                        />
                    </div>

                    {error && (
                        <div className="login-error">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    <Button
                        type="submit"
                        variant="primary"
                        className="login-submit"
                        disabled={loading}
                    >
                        {loading ? 'Please wait...' : (isRegister ? 'Create Account' : 'Sign In')}
                        {!loading && <ArrowRight size={16} />}
                    </Button>
                </form>

                <p className="login-switch">
                    {isRegister ? 'Already have an account?' : "Don't have an account?"}
                    <button onClick={() => { setIsRegister(!isRegister); setError(''); }}>
                        {isRegister ? 'Sign In' : 'Register'}
                    </button>
                </p>
            </Card>
        </div>
    );
};

export default Login;
