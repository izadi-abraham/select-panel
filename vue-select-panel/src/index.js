import SelectPanel from './components/SelectPanel.vue';
import './styles.css'

const VueSelectPanel = {
    install: (app) => {
        app.component('SelectPanel', SelectPanel);
    },
};

export default VueSelectPanel;