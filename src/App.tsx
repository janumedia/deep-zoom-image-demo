import type { Component } from 'solid-js';

// import logo from './logo.svg';
import styles from './App.module.css';
import ImageZoom from './components/ImageZoom';

const App: Component = () => {
  return (
    <div class={styles.App}>
      <ImageZoom></ImageZoom>
    </div>
  );
};

export default App;
