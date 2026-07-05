import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// Detect local vs remote: use relative paths when remote (Vite proxies /api to Express)
const _hostname = window.location.hostname;
const _isLocal = _hostname === 'localhost' || _hostname === '127.0.0.1' || /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(_hostname);
const API_URL = _isLocal ? `http://${_hostname}:3001` : '';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('unmocked_token'));
    const [loading, setLoading] = useState(true);

    // Verify token on mount
    useEffect(() => {
        if (!token) {
            setLoading(false);
            return;
        }

        fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => {
                if (!r.ok) throw new Error('Invalid token');
                return r.json();
            })
            .then(data => {
                setUser(data.user);
                setLoading(false);
            })
            .catch(() => {
                localStorage.removeItem('unmocked_token');
                setToken(null);
                setUser(null);
                setLoading(false);
            });
    }, [token]);

    const register = useCallback(async (name, email, password) => {
        const res = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');

        localStorage.setItem('unmocked_token', data.token);
        setToken(data.token);
        setUser(data.user);
        return data;
    }, []);

    const login = useCallback(async (email, password) => {
        const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        localStorage.setItem('unmocked_token', data.token);
        setToken(data.token);
        setUser(data.user);
        return data;
    }, []);

    const forceChangePassword = useCallback(async (email, oldPassword, newPassword) => {
        const res = await fetch(`${API_URL}/api/auth/force-change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, oldPassword, newPassword }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to change password');

        localStorage.setItem('unmocked_token', data.token);
        setToken(data.token);
        setUser(data.user);
        return data;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('unmocked_token');
        setToken(null);
        setUser(null);
    }, []);

    const authFetch = useCallback(async (path, options = {}) => {
        const res = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                ...options.headers,
            },
        });
        return res;
    }, [token]);

    return (
        <AuthContext.Provider value={{
            user,
            setUser,
            token,
            loading,
            isAuthenticated: !!user,
            register,
            login,
            logout,
            forceChangePassword,
            authFetch,
        }}>
            {children}
        </AuthContext.Provider>
    );
};
