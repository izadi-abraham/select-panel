/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './react-select-panel/**/*.{html,js,ts,vue}',  // Adjust this path based on your folder structure
    './vue-select-panel/**/*.{html,js,ts,vue}',  // Same here for shared components in the libs
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

