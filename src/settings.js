export class Settings {
  constructor(physics) {
    this.physics = physics;
    this.setupEventListeners();
    this.updatePhysicsReferences();
  }

  setupEventListeners() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');

    // Toggle panel
    settingsBtn.addEventListener('click', () => {
      settingsPanel.classList.toggle('open');
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#settingsBtn') && !e.target.closest('#settingsPanel')) {
        settingsPanel.classList.remove('open');
      }
    });

    // Damping slider
    const dampingSlider = document.getElementById('damping');
    dampingSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('dampingValue').textContent = value.toFixed(4);
      this.physics.updateParameter('DAMPING', value);
    });

    // Spring K slider
    const springKSlider = document.getElementById('springK');
    springKSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('springKValue').textContent = Math.round(value);
      this.physics.updateParameter('SPRING_K', value);
    });

    // Substeps slider
    const substepsSlider = document.getElementById('substeps');
    substepsSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      document.getElementById('substepsValue').textContent = value;
      this.physics.updateParameter('SUBSTEPS', value);
    });

    // Gravity slider
    const gravitySlider = document.getElementById('gravity');
    gravitySlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('gravityValue').textContent = value.toFixed(1);
      this.physics.updateParameter('GRAVITY', value);
    });

    // Drag K slider
    const dragKSlider = document.getElementById('dragK');
    dragKSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      document.getElementById('dragKValue').textContent = Math.round(value);
      this.physics.updateParameter('DRAG_K', value);
    });

    // Rest length select
    const restLengthSelect = document.getElementById('restLength');
    restLengthSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      this.physics.updateRestLength(value);
    });
  }

  updatePhysicsReferences() {
    // Store reference for exposing to window
    window.settings = this;
  }
}

export default { Settings };
