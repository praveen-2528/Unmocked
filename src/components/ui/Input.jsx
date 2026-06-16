import React from 'react';
import './Input.css';

const Input = React.forwardRef(({ className = '', label, error, ...props }, ref) => {
    return (
        <div className="input-wrapper">
            {label && <label className="input-label">{label}</label>}
            <input
                className={`input-field ${error ? 'input-error' : ''} ${className}`}
                ref={ref}
                {...props}
            />
            {error && <span className="input-error-msg">{error}</span>}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
