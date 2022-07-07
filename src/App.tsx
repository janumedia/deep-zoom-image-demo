import type { Component } from 'solid-js';

// import logo from './logo.svg';
import styles from './App.module.css';
import ImageZoom from './components/ImageZoom';

const App: Component = () => {
  return (
    <div class={styles.App}>
      <ImageZoom src="/images/TM-10016388/imageproxy.json"></ImageZoom>
    </div>
  );
};

export default App;
