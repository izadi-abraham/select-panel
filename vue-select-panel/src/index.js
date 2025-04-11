import SelectPanel from './components/SelectPanel.vue';

const VueSelectPanel = {
    install: (app) => {
        app.component('SelectPanel', SelectPanel);
    },
};

export default VueSelectPanel;