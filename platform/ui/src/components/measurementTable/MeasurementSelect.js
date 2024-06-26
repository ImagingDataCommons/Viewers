import React from 'react';
import Select from 'react-select';
import PropTypes from 'prop-types';

const MeasurementSelect = ({ value, formatOptionLabel, options, onChange }) => (
  <Select
    value={value === undefined ? null : value}
    formatOptionLabel={formatOptionLabel}
    styles={measurementSelectStyles}
    options={options}
    onChange={onChange}
  />
);

MeasurementSelect.propTypes = {
  value: PropTypes.object.isRequired,
  formatOptionLabel: PropTypes.any,
  options: PropTypes.array.isRequired,
  onChange: PropTypes.func,
};

const computedstyle = getComputedStyle(document.body);
const uiGrayDarker = computedstyle.getPropertyValue('--ui-gray-darker');
const activeColor = computedstyle.getPropertyValue('--active-color');
const defaultColor = computedstyle.getPropertyValue('--default-color');
const uiGrayDark = computedstyle.getPropertyValue('--ui-gray-dark');

const measurementSelectStyles = {
  singleValue: (base, state) => ({
    ...base,
    width: '100%',
  }),
  control: (base, state) => ({
    ...base,
    cursor: 'pointer',
    background: uiGrayDarker,
    borderRadius: state.isFocused ? '5px 5px 5px 5px' : 5,
    borderColor: state.isFocused ? activeColor : defaultColor,
    boxShadow: state.isFocused ? null : null,
    minHeight: '50px',
    '&:hover': {
      borderColor: activeColor,
    },
  }),
  menu: base => ({
    ...base,
    borderRadius: 5,
    background: uiGrayDarker,
  }),
  option: (base, state) => ({
    ...base,
    cursor: 'pointer',
    '&:first-of-type': {
      borderTopLeftRadius: 5,
      borderTopRightRadius: 5,
    },
    '&:last-of-type': {
      borderBottomLeftRadius: 5,
      borderBottomRightRadius: 5,
    },
    background: state.isSelected ? uiGrayDark : uiGrayDarker,
    '&:hover': {
      background: uiGrayDark,
    },
  }),
};

export default MeasurementSelect;
