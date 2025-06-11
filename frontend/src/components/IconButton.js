import React from 'react';
import PropTypes from 'prop-types';
import './IconButton.css';

/**
 * Generic circular icon button using Bootstrap Icons.
 */
export default function IconButton({ icon, label, className = '', ...props }) {
  return (
    <button aria-label={label} title={label} className={`icon-button ${className}`} {...props}>
      <i className={`bi bi-${icon}`}></i>
    </button>
  );
}

IconButton.propTypes = {
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  className: PropTypes.string
};
