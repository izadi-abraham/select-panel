<script lang="ts" setup>
import { isEqual as _isEqual, debounce as _debounce } from 'lodash-es';
import { nextTick, computed, onMounted, ref, watch } from 'vue';
import { useWindowSize } from '@vueuse/core';
import { v4 as uuidv4 } from 'uuid';



enum PanelHeight {
    CUSTOM = 'custom',
    NORMAL ='normal',
    LARGE = 'large'
};

type SelectPanelValueType<T extends any> = T | T[];


interface SelectPanelOption<T extends any> {
    id?: T;
    code?: string;
    value?: boolean;
    label: string;
    hidden?: boolean;
    classes?: string;
}


interface Props {
    placeholder?: string;
    label?: string;
    labelInfo?: string;
    labelWidth?: string;
    labelWeight?: string;
    required?: boolean;
    groupOptions?: Group[];
    // TODO after we switch to radio switch, we should revert the type back to `string | number`
    individualOptions: SelectPanelOption<any>[];
    value?: SelectPanelValueType<string | number>;
    groupOptionsTitle?: string;
    individualOptionsTitle?: string;
    summarySelector?: string;
    optionNameSelector?: string;
    optionValueSelector?: string;
    showBadges?: boolean;
    panelHeight?: (typeof PanelHeight)[keyof typeof PanelHeight] | string;
    customSelectionSummary?: boolean;
    multiple?: boolean;
    loading?: boolean;
    dataCy?: string;
    observerSelector?: string;
    selectionSummaryStyle?: string;
    panelWidth?: string;
    disabled?: boolean;
}

const uuid = uuidv4();

interface Group {
    children: {
        id: string;
        label: string;
    }[];
    id: number;
    label: string;
    value: boolean;
}

interface SelectionSummary {
    groupSummary: string;
    individualSummary: string;
}

const emit = defineEmits<{
    (event: 'selectionChange', selection: SelectPanelValueType<string | number>): void;
    (event: 'panelClosed'): void;
    (event: 'defaultSummaryChange', selectionSummary: SelectionSummary): void;
    (event: 'search', value: string): void;
    (event: 'clear'): void;
}>();

const props = withDefaults(defineProps<Props>(), {
    placeholder: 'Search option',
    label: '',
    required: false,
    groupOptions: () => [],
    value: '',
    summarySelector: 'id',
    optionNameSelector: 'label',
    optionValueSelector: 'value',
    showBadges: false,
    panelHeight: PanelHeight.NORMAL,
    customSelectionSummary: false,
    multiple: false,
    loading: false,
    observerSelector: '#app',
    disabled: false
});

const groups = ref<Group[]>(props.groupOptions);
const individuals = ref<SelectPanelOption<string | number>[]>(props.individualOptions);
const selectedIndividuals = ref<Set<SelectPanelOption<string | number>>>(new Set());
const selectedIndividualIds = ref<Set<any>>(new Set(Array.isArray(props.value) ? props.value : undefined));
const selectedSingleValue = ref<any>(Array.isArray(props.value) ? undefined : props.value);
const selectedGroups = ref<Set<Group>>(new Set());
const searchQuery = ref<string>('');
const isOptionsPanelVisible = ref(false);
const selectPanelWrapper = ref<HTMLElement | null>(null);
const selectedOptionIndex = ref<number>(0);
const defaultSelectionSummary = ref<SelectionSummary>({
    groupSummary: '',
    individualSummary: ''
});
const openDirection = ref<'top' | 'bottom'>('bottom');
const selectPanel = ref<HTMLElement | null>(null);
const { height } = useWindowSize();

const searchInput = ref<HTMLInputElement | null>(null);

const focus = () => {
    searchInput.value?.focus();
};

defineExpose({
    focus
});

const recalculateOpenDirection = _debounce(() => {
    if (!selectPanel.value) {
        return;
    }

    const distanceFromBottom = document.body.scrollHeight - selectPanel.value.offsetTop;

    // Pixels from the bottom of the page to the select component where the panel should be displayed above
    const threshold = 500;

    openDirection.value = distanceFromBottom < threshold ? 'top' : 'bottom';
}, 200);

const observedElement = document.querySelector(props.observerSelector ?? '#app');

const observer = new ResizeObserver(() => {
    recalculateOpenDirection();
});

const handleGroupSelection = (group: Group) => {
    if (selectedGroups.value.has(group)) {
        group.children.forEach((child) => {
            selectedIndividualIds.value.delete(child.id);
            removeIdFromSelectedIndividual(child.id);
        });

        return;
    }
    group.children.forEach((child) => {
        selectedIndividualIds.value.add(child.id);
        addIdToSelectedIndividual(child.id);
    });
};

const unselectIndividual = (individual: SelectPanelOption<string | number>) => {
    if (props.multiple) {
        selectedIndividualIds.value.delete(individual.id);
        selectedIndividuals.value.delete(individual);

        return;
    }
    selectedSingleValue.value = '';
};

const selectIndividual = (individual: SelectPanelOption<string | number>) => {
    if (props.multiple) {
        selectedIndividualIds.value.add(individual.id);
        selectedIndividuals.value.add(individual);

        return;
    }
    selectedSingleValue.value = individual.id;
    hideOptionsPanel();
};

const selectOrUnselectIndividual = (individual: SelectPanelOption<string | number>) => {
    if (
        selectedIndividualIds.value.has(individual.id) ||
        (selectedSingleValue.value === individual.id && !props.required)
    ) {
        unselectIndividual(individual);

        return;
    }
    selectIndividual(individual);
};

const resetSearch = () => {
    individuals.value = props.individualOptions;
    if (groupPropExist.value) {
        groups.value = props.groupOptions;
    }
};

const filterOptions = () => {
    individuals.value = props.individualOptions.filter((individualOption) => {
        return individualOption.label?.toLowerCase().includes(searchQuery.value.toLowerCase());
    });
    if (groupPropExist.value) {
        groups.value = props.groupOptions.filter((group) => {
            return group.label?.toLowerCase().includes(searchQuery.value.toLowerCase());
        });
    }
};

const handleSearchChange = () => {
    emit('search', searchQuery.value);

    if (!searchQuery.value) {
        resetSearch();

        return;
    }

    showOptionsPanel();

    filterOptions();
};

const handleClickOutsidePanel = (event: MouseEvent) => {
    if (selectPanelWrapper.value && !selectPanelWrapper.value.contains(event.target as Node)) {
        hideOptionsPanel();
    }
};

const isSubsetOf = (subset: Group['children'], source: string[]) => {
    if (subset.length > source.length) {
        return false;
    }
    const sourceSet = new Set(source);
    const flattenSubset = subset.map((elem) => elem.id);

    return flattenSubset.every((elem) => sourceSet.has(elem));
};

const sortSelectedGroups = () => {
    selectedGroups.value = new Set([...selectedGroups.value].sort((a, b) => b.children.length - a.children.length));
};

const updateSelectionSummary = () => {
    if (!props.multiple) {
        defaultSelectionSummary.value.individualSummary =
            props.individualOptions.find((option) => option.id === selectedSingleValue.value)?.label || '';

        return;
    }
    sortSelectedGroups();
    const localSelectedIndividuals = new Set(selectedIndividualIds.value);
    let groupSummary: Set<Group> = new Set();
    const defaultSelector: boolean = props.summarySelector === 'id';

    const removeGroupChildren = (group: Group) => {
        for (const child of group.children) {
            localSelectedIndividuals.delete(child.id);
        }
    };

    const addTheOnlyGroupToSummary = () => {
        const onlySelectedGroup = Array.from(selectedGroups.value)[0];

        groupSummary.add(onlySelectedGroup);
        removeGroupChildren(onlySelectedGroup);
    };

    const removeGroupFromSummary = (group: Group) => {
        groupSummary.delete(group);
        removeGroupChildren(group);
    };

    const sortSummary = () => {
        groupSummary = new Set(
            [...groupSummary].sort((a, b) => b.children.length - a.children.length).map((group) => group)
        );
    };

    const existInIndividuals = (group: Group) => {
        return isSubsetOf(group.children, [...localSelectedIndividuals.values()]);
    };

    const areSameGroups = (firstGroup: Group, secondGroup: Group) => {
        return firstGroup.id === secondGroup.id;
    };

    const checkPossibleSubsetsInGroupSummary = () => {
        for (const groupFromStartIndex of groupSummary) {
            for (const groupFromEndIndex of groupSummary) {
                if (
                    !areSameGroups(groupFromStartIndex, groupFromEndIndex) &&
                    isSubsetOf(
                        groupFromStartIndex.children,
                        groupFromEndIndex.children.map((child) => child.id)
                    )
                ) {
                    groupSummary.delete(groupFromStartIndex);
                }
            }
        }
    };

    const getIndividualsSelector = (individualIds: string[]) => {
        return individualIds.map((individualId) => {
            for (const individualOption of props.individualOptions) {
                if (individualOption.id === individualId) {
                    return individualOption[props.summarySelector as keyof SelectPanelOption<string | number>];
                }
            }
        });
    };

    const individualsSummary = () => {
        return defaultSelector
            ? Array.from(localSelectedIndividuals)
            : getIndividualsSelector(Array.from(localSelectedIndividuals));
    };

    if (selectedGroups.value.size === 0 && selectedIndividualIds.value.size === 0) {
        defaultSelectionSummary.value = {
            groupSummary: '',
            individualSummary: ''
        };

        emit('defaultSummaryChange', defaultSelectionSummary.value);

        return;
    }

    if (!groupPropExist.value || selectedGroups.value.size === 0) {
        defaultSelectionSummary.value.individualSummary = `${individualsSummary().join(' / ')}`;
        defaultSelectionSummary.value.groupSummary = '';
        groupSummary.clear();

        emit('defaultSummaryChange', defaultSelectionSummary.value);

        return;
    }

    if (selectedGroups.value.size === 1) {
        addTheOnlyGroupToSummary();
    }

    for (const groupInSummary of groupSummary) {
        if (!selectedGroups.value.has(groupInSummary)) {
            removeGroupFromSummary(groupInSummary);
        }
    }

    for (const group of selectedGroups.value) {
        if (existInIndividuals(group)) {
            groupSummary.add(group);
            removeGroupChildren(group);
            sortSummary();
        }
    }

    checkPossibleSubsetsInGroupSummary();

    defaultSelectionSummary.value = {
        groupSummary: `${Array.from(groupSummary.values())
            .map((group) => group.label)
            .join(' / ')}`,
        individualSummary: `${localSelectedIndividuals.size ? ` / ${individualsSummary().join(' / ')}` : ''}`
    };

    emit('defaultSummaryChange', defaultSelectionSummary.value);
};

const addToSelectedGroups = (group: Group) => {
    selectedGroups.value.add(group);
};

const deleteFromSelectedGroups = (group: Group) => {
    selectedGroups.value.delete(group);
};

const refreshSelectedGroups = () => {
    props.groupOptions.forEach((group) => {
        if (group.children.every((child) => selectedIndividualIds.value.has(child.id))) {
            addToSelectedGroups(group);
        } else {
            deleteFromSelectedGroups(group);
        }
    });
};

const focusFirstOption = (target: HTMLElement) => {
    for (const element of target?.parentElement?.children as HTMLCollection) {
        if (element.classList.value.includes('options-container')) {
            const groupOptionsContainer = element?.children[0] as HTMLElement;
            let individualOptionsContainer;

            if (groupPropExist.value) {
                const groupOptionExists = !!(
                    groupOptionsContainer?.children[0]?.classList.value.includes('select-panel-option') ||
                    groupOptionsContainer?.children[1]?.classList.value.includes('select-panel-option')
                );

                if (groupOptionExists) {
                    focusFirstGroupOption(groupOptionsContainer);

                    return;
                }
                individualOptionsContainer = element?.children[1] as HTMLElement;
                focusFirstIndividualOption(individualOptionsContainer);

                return;
            }

            individualOptionsContainer = element?.children[0] as HTMLElement;

            focusFirstIndividualOption(individualOptionsContainer);
        }
    }
};

const focusSearchBarFromOption = (target: HTMLElement) => {
    const searchBar = target?.parentElement?.parentElement?.parentElement?.firstElementChild;

    if (searchBar?.id === 'panel-search-bar') {
        (searchBar as HTMLElement)?.focus();
    }
};

const focusNextOption = (target: HTMLElement) => {
    const targetIndex = Array.from(target.parentNode?.children as HTMLCollection).indexOf(target);
    const nextOption = Array.from(target.parentNode?.children as HTMLCollection)[targetIndex + 1] as HTMLElement;

    nextOption?.focus();
};

const getFocusBackToOption = (target: HTMLElement) => {
    const wrapper = Array.from(target.children).find((childElement) =>
        childElement.classList.value.includes('select-panel-wrapper')
    );
    const optionsContainer = Array.from(wrapper?.children as HTMLCollection).find((childElement) =>
        childElement.classList.value.includes('options-container')
    );
    const individualOptionsContainer = Array.from(optionsContainer?.children as HTMLCollection).find((childElement) =>
        childElement.classList.value.includes('select-panel-individual-options-container')
    );
    const individualOption = individualOptionsContainer?.children[selectedOptionIndex.value] as HTMLElement;

    individualOption?.focus();
};

const focusPreviousOption = (target: HTMLElement) => {
    const targetIndex = Array.from(target.parentNode?.children as HTMLCollection).indexOf(target);
    const previousOption = Array.from(target.parentNode?.children as HTMLCollection)[targetIndex - 1] as HTMLElement;

    previousOption?.focus();
};

const focusFirstIndividualOption = (target: HTMLElement) => {
    if (target?.offsetParent?.children) {
        for (const htmlElement of target.offsetParent.children) {
            if (htmlElement.classList.value.includes('select-panel-individual-options-container')) {
                (htmlElement.children[1] as HTMLElement)?.focus();
                htmlElement.scroll({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        }
    }
};

const focusFirstGroupOption = (target: HTMLElement) => {
    if (target?.offsetParent?.children) {
        for (const htmlElement of target.offsetParent.children) {
            if (htmlElement.classList.value.includes('select-panel-group-options-container')) {
                (htmlElement.children[1] as HTMLElement)?.focus();
                htmlElement.scroll({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        }
    }
};

const hideOptionsPanel = () => {
    searchQuery.value = '';
    isOptionsPanelVisible.value = false;
};

const handleIndividualSelection = (event: KeyboardEvent, individual: SelectPanelOption<string | number>) => {
    event.preventDefault();
    const target = event.target as HTMLElement;

    const selectedOptionIndex = Array.from(target.parentNode?.children as HTMLCollection).indexOf(target);

    selectOrUnselectIndividual(individual);

    nextTick(() => {
        Array.from(selectPanelWrapper.value?.querySelector('.select-panel-individual-options-container')?.children)[
            selectedOptionIndex
            ]?.focus();
    });
};

const getHeightClass = () => {
    if (props.panelHeight === PanelHeight.NORMAL) {
        return 'h-[45vh]';
    }

    if (props.panelHeight === PanelHeight.LARGE) {
        return 'h-[70vh]';
    }

    return getHeightStyle();
};

const getHeightStyle = () => {
    return `height: ${props.panelHeight};`;
};

const anyOptionExist = (optionGroup: HTMLElement): boolean => {
    return Array.from(optionGroup.children).some((element) => element.classList.value.includes('select-panel-option'));
};

const handleKeyboardEvents = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const isSelectPanelOption: boolean = target.classList.value.includes('select-panel-option');
    const isPanelIndividualOption: boolean = target.classList.value.includes('select-panel-option individual-option');
    const isPanelGroupOption: boolean = target.classList.value.includes('select-panel-option group-option');
    const isSearchBar: boolean = target.id === 'panel-search-bar';
    const isPanelContainer: boolean = target.classList.value.includes('select-panel-container');
    const isPanelIcon: boolean = target.classList.value.includes('panel-icon');

    if (event.key === 'ArrowDown') {
        event.preventDefault();

        if (isSelectPanelOption) {
            focusNextOption(target);
        }

        if (isSearchBar) {
            focusFirstOption(target);
        }

        if (isPanelContainer) {
            getFocusBackToOption(target);
        }
    }

    if (event.key === 'ArrowUp') {
        const previousElement = target?.previousElementSibling as HTMLElement;
        const previousOptionExist = previousElement?.classList.value.includes('select-panel-option');

        event.preventDefault();

        if (previousOptionExist && isSelectPanelOption) {
            focusPreviousOption(target);

            return;
        }

        if (isPanelContainer) {
            getFocusBackToOption(target);

            return;
        }

        focusSearchBarFromOption(target);
    }

    if (event.key === 'ArrowRight') {
        if (isPanelGroupOption) {
            focusFirstIndividualOption(target);
        }
    }

    if (event.key === 'ArrowLeft') {
        if (isPanelIndividualOption) {
            focusFirstGroupOption(target);
        }
    }

    if (event.key === 'Escape') {
        event.preventDefault();
        hideOptionsPanel();
    }

    if (event.key === 'Tab') {
        if (!props.individualOptions.length) {
            hideOptionsPanel();
        }

        if (isSelectPanelOption) {
            if (!target.nextElementSibling || (target.nextElementSibling as HTMLElement)?.tabIndex === -1) {
                hideOptionsPanel();
            }
        }

        if (isPanelIcon) {
            const optionsContainerIndex = Array.from(target.parentNode?.children as HTMLCollection).findIndex(
                (element) => element.classList.value.includes('options-container')
            );
            const optionsContainer = target.parentNode?.children[optionsContainerIndex] as HTMLElement;
            const noOtherIconExist = !target.nextElementSibling?.classList.value.includes('panel-icon');
            let noOptionExist = false;

            for (const optionGroup of optionsContainer.children) {
                noOptionExist = !anyOptionExist(optionGroup as HTMLElement);
            }

            if (noOptionExist && noOtherIconExist) {
                hideOptionsPanel();
            }
        }

        if ((isSearchBar || isPanelContainer) && event.shiftKey) {
            hideOptionsPanel();
        }
    }
};

const handleClearSelection = (event: PointerEvent) => {
    selectedSingleValue.value = '';
    selectedIndividualIds.value.clear();
    selectedIndividuals.value.clear();
    focus();
    emit('clear');
};

const handleClearSearchQuery = (event: PointerEvent) => {
    searchQuery.value = '';
    focus();
    emit('clear');
};

const handleSelectionSummaryClick = () => {
    selectPanelWrapper.value &&
    !props.loading &&
    ((selectPanelWrapper.value as HTMLElement).firstElementChild as HTMLElement)?.focus();
};

const addIdToSelectedIndividual = (individualId: string) => {
    selectedIndividuals.value.add(
        props.individualOptions.find((individual) => individual.id === individualId) as SelectPanelOption<
            string | number
        >
    );
};

const removeIdFromSelectedIndividual = (individualId: string) => {
    selectedIndividuals.value = new Set(
        Array.from(selectedIndividuals.value).filter((selectedIndividual) => selectedIndividual.id !== individualId)
    );
};

const updateSelectedIndividuals = () => {
    selectedIndividualIds.value.forEach((individualId) => {
        addIdToSelectedIndividual(individualId);
    });

    return;
};

const sortIndividuals = () => {
    if (!props.multiple) {
        individuals.value = individuals.value.sort((firstIndividual, secondIndividual) => {
            if (selectedSingleValue.value === firstIndividual.id) {
                return -1;
            }
            if (selectedSingleValue.value === secondIndividual.id) {
                return 1;
            }
            if (secondIndividual.label > firstIndividual.label) {
                return -1;
            }
            if (firstIndividual.label > secondIndividual.label) {
                return 1;
            }

            return 0;
        });

        return;
    }

    individuals.value = individuals.value.sort((firstIndividual, secondIndividual) => {
        if (
            selectedIndividualIds.value.has(firstIndividual.id) &&
            !selectedIndividualIds.value.has(secondIndividual.id)
        ) {
            return -1;
        }
        if (
            selectedIndividualIds.value.has(secondIndividual.id) &&
            !selectedIndividualIds.value.has(firstIndividual.id)
        ) {
            return 1;
        }
        if (secondIndividual.label > firstIndividual.label) {
            return -1;
        }
        if (firstIndividual.label > secondIndividual.label) {
            return 1;
        }

        return 0;
    });
};

const sortGroups = () => {
    groups.value = groups.value.sort(
        (firstGroup: Group, secondGroup: Group) => secondGroup.children.length - firstGroup.children.length
    );
};

const updateSelectedValue = (value: SelectPanelValueType<string | number>) => {
    updateSelectionSummary();
    updateSelectedIndividuals();
    sortIndividuals();
    const selectedValuesSet = Array.isArray(value) ? new Set(value) : new Set([value]);

    if (
        (value === selectedSingleValue.value && !props.multiple) ||
        (_isEqual(selectedValuesSet, selectedIndividualIds.value) && props.multiple)
    ) {
        return;
    }

    if (props.multiple) {
        selectedIndividualIds.value = selectedValuesSet;

        return;
    }
    selectedSingleValue.value = Array.isArray(value) ? '' : value;
};

const showOptionsPanel = () => {
    recalculateOpenDirection();
    if (props.loading) {
        return;
    }

    if (
        !searchQuery.value &&
        !individuals.value.length &&
        !selectedSingleValue.value &&
        !selectedIndividualIds.value.size
    ) {
        return;
    }

    isOptionsPanelVisible.value = true;
};

const groupPropExist = computed(() => props.groupOptions.length > 0);

const defaultSummaryExist = computed(
    () => !!defaultSelectionSummary.value.groupSummary || !!defaultSelectionSummary.value.individualSummary
);

const showSelectionSummary = computed(
    () => (defaultSummaryExist.value || props.customSelectionSummary) && !isOptionsPanelVisible.value && !props.loading
);

watch(searchQuery, () => {
    handleSearchChange();
});

watch(
    selectedIndividualIds,
    () => {
        refreshSelectedGroups();
        updateSelectionSummary();
        emit('selectionChange', Array.from(selectedIndividualIds.value));
        sortIndividuals();
    },
    { deep: true }
);

watch(
    () => props.value,
    () => {
        updateSelectedValue(props.value);
    }
);

watch(selectedSingleValue, () => {
    if (!props.multiple) {
        refreshSelectedGroups();
        updateSelectionSummary();
        emit('selectionChange', selectedSingleValue.value);
        sortIndividuals();
    }
});

watch(isOptionsPanelVisible, (value) => {
    if (value) {
        return;
    }

    emit('panelClosed');
});

watch(
    () => props.individualOptions,
    () => {
        individuals.value = props.individualOptions;
        updateSelectedValue(props.value);
    }
);

watch(
    () => props.groupOptions,
    () => {
        groups.value = props.groupOptions;
    }
);

watch([height, selectPanel], () => {
    recalculateOpenDirection();
});

onMounted(() => {
    document.addEventListener('click', handleClickOutsidePanel);
    sortIndividuals();
    sortGroups();
    if (props.value !== undefined) {
        refreshSelectedGroups();
        updateSelectedIndividuals();
        updateSelectionSummary();
    }
});

if (observedElement) {
    observer.observe(observedElement);
}
if (!observedElement) {
    console.warn('Element to observe not found');
}
</script>

<template>
    <div
        ref="selectPanel"
        :data-cy="props.dataCy"
        :tabindex="-1"
        class="select-panel-container flex items-center focus:outline-none text-red-600 border border-gray-800"
        @keydown="handleKeyboardEvents"
    >
        <!-- Panel label -->
        <label
            v-if="props.label"
            :class="[
                props.labelWeight ? props.labelWeight : 'font-bold',
                props.labelWidth ? props.labelWidth : 'w-[11.5rem]'
            ]"
        >{{ props.label }}<span class="text-danger-500"> <span v-if="props.required"> *</span></span></label
        >

        <div
            ref="selectPanelWrapper"
            :class="props.panelWidth ? props.panelWidth : 'w-[24rem]'"
            class="select-panel-wrapper relative"
        >
            <!-- search bar(input) -->
            <input
                id="panel-search-bar"
                ref="searchInput"
                v-model="searchQuery"
                :class="isOptionsPanelVisible ? 'rounded-b-none border-b-0' : ''"
                :disabled="props.disabled"
                :placeholder="props.disabled ? '' : props.placeholder"
                :tabindex="0"
                autoComplete="off"
                class="h-10 w-full rounded border border-slate-200 p-2 outline-0 focus:border-slate-200 focus:ring-[.08rem] focus:ring-inset focus:ring-sky-500"
                type="text"
                @focus="showOptionsPanel()"
                @keydown.esc.prevent="hideOptionsPanel()"
                @keydown.enter.prevent="showOptionsPanel()"
            />

            <span
                v-show="props.loading"
                :style="{ width: 24 }"
                class="panel-icon absolute right-[.5rem] top-[.5rem] mr-2"
            >
<!--                <img-->
<!--                    :height="24"-->
<!--                    :width="24"-->
<!--                    alt="loading"-->
<!--                    class="text-red-500"-->
<!--                    src="@/ui/assets/images/spinner-dark.svg"-->
<!--                />-->
            </span>

            <!-- Icons -->
<!--            <icon-base-->
<!--                v-show="(selectedIndividualIds.size || selectedSingleValue) && isOptionsPanelVisible && !props.required"-->
<!--                :height="16"-->
<!--                :tabindex="0"-->
<!--                :width="20"-->
<!--                class="panel-icon absolute right-[2rem] top-[.7rem] cursor-pointer focus:rounded-sm focus:outline-none focus:ring-[.08rem] focus:ring-inset focus:ring-sky-500"-->
<!--                icon-name="Clear selection"-->
<!--                @click="handleClearSelection"-->
<!--                @keydown.space.prevent="handleClearSelection"-->
<!--                @keydown.enter.prevent="handleClearSelection"-->
<!--            >-->
<!--                <sort-variant-remove />-->
<!--            </icon-base>-->
<!--            <icon-base-->
<!--                v-show="searchQuery && isOptionsPanelVisible"-->
<!--                :height="14"-->
<!--                :tabindex="0"-->
<!--                :width="18"-->
<!--                class="panel-icon absolute right-[0.75rem] top-[.78rem] cursor-pointer focus:rounded-sm focus:outline-none focus:ring-[.08rem] focus:ring-inset focus:ring-sky-500"-->
<!--                icon-name="Clear search"-->
<!--                @click="handleClearSearchQuery"-->
<!--                @keydown.space.prevent="handleClearSearchQuery"-->
<!--                @keydown.enter.prevent="handleClearSearchQuery"-->
<!--            >-->
<!--                <icon-close />-->
<!--            </icon-base>-->

            <!-- Selection summary -->
            <div
                v-show="showSelectionSummary"
                :class="`${props.disabled ? 'bg-transparent' : 'bg-white '} ${props.selectionSummaryStyle}`"
                class="absolute left-[0.125rem] top-[0.125rem] w-[95%] whitespace-nowrap pl-2 pt-2 text-[.81rem] font-bold tracking-wider"
                @click="handleSelectionSummaryClick"
            >
                <div
                    v-if="defaultSelectionSummary && !props.customSelectionSummary"
                    :title="`${defaultSelectionSummary.groupSummary} ${defaultSelectionSummary.individualSummary}`"
                    class="truncate text-blue-600"
                >
                    <span class="text-blue-700">
                        {{ defaultSelectionSummary.groupSummary }}
                    </span>
                    <span>
                        {{ defaultSelectionSummary.individualSummary }}
                    </span>
                </div>
                <slot name="custom-selection-summary"></slot>
            </div>

            <!-- Options -->
            <div
                :class="{
                    [getHeightClass()]: true,
                    [isOptionsPanelVisible ? 'block' : 'hidden']: true,
                    'bottom-[90%] shadow-lg-reversed': openDirection === 'top'
                }"
                :style="getHeightClass()"
                class="options-container absolute z-50 flex w-full rounded rounded-t-none border bg-white text-sm font-medium leading-7 shadow-xl"
            >
                <!-- Groups -->
                <div
                    v-if="groupPropExist"
                    :class="{ 'w-[50%]': groupPropExist }"
                    class="select-panel-group-options-container overflow-scroll"
                >
                    <!-- title -->
                    <div
                        v-if="groupOptionsTitle"
                        :class="`select-panel-group-title absolute top-0 flex border-b bg-white p-1 pl-4 font-bold tracking-wider text-indigo-800 ${groupPropExist ? 'w-[50%]' : ''}`"
                    >
                        {{ props.groupOptionsTitle }}
                        <div v-if="props.multiple && selectedGroups.size" class="text-xs text-blue-600">
                            {{ `(${selectedGroups.size})` }}
                        </div>
                    </div>

                    <!-- options -->
                    <div
                        v-for="(group, index) in groups"
                        :key="uuid + group.id + index"
                        :class="{
                            'selected-option': selectedGroups.has(group),
                            'mt-12': index === 0,
                            'mb-6': index === groups.length - 1
                        }"
                        :tabindex="index === 0 ? 0 : -1"
                        :title="group.label"
                        class="select-panel-option group-option cursor-pointer truncate px-2 focus:rounded-sm focus:outline-none focus:ring-[.08rem] focus:ring-inset focus:ring-sky-500"
                        @click="handleGroupSelection(group)"
                        @keydown.space.prevent="handleGroupSelection(group)"
                        @keydown.enter.prevent="handleGroupSelection(group)"
                    >
                        {{ group[props.optionNameSelector] }}
                    </div>
                </div>

                <!-- Individuals -->
                <div
                    :class="groupPropExist ? 'w-[50%]' : 'w-full border-t-0'"
                    class="select-panel-individual-options-container overflow-scroll border border-r-0"
                >
                    <!-- title -->
                    <div
                        v-if="individualOptionsTitle"
                        :class="`select-panel-individual-title absolute top-0 flex items-center border-b border-r bg-white p-1 pl-4 font-bold text-indigo-800 ${groupPropExist ? 'w-[50%]' : 'w-full'}`"
                    >
                        {{ props.individualOptionsTitle }}
                        <div v-if="props.multiple && selectedIndividualIds.size" class="text-xs text-blue-600">
                            {{ `(${selectedIndividualIds.size})` }}
                        </div>

<!--                        <icon-base-->
<!--                            v-show="props.labelInfo"-->
<!--                            :icon-name="props.labelInfo"-->
<!--                            class="ml-1 h-5 w-5 cursor-pointer"-->
<!--                            @click="handleClearSearchQuery"-->
<!--                        >-->
<!--                            <icon-info />-->
<!--                        </icon-base>-->
                    </div>

                    <!-- options -->
                    <div
                        v-if="!individuals.length && (!searchQuery || searchQuery.length < 2)"
                        class="mt-12 truncate pl-2 text-gray-600"
                    >
                        Type to search (min 2 characters)...
                    </div>
                    <div
                        v-else-if="!individuals.length && searchQuery?.length >= 2 && !loading"
                        class="mt-12 truncate pl-2 text-gray-600"
                    >
                        Nothing matched your query.
                    </div>

                    <div
                        v-for="(individual, index) in individuals"
                        v-else
                        :key="uuid + individual.id"
                        :class="{
                            'pl-2': groupPropExist,
                            'mt-12': index === 0,
                            'px-2': !groupPropExist,
                            'mb-6': index === individuals.length - 1,
                            'selected-option':
                                selectedIndividualIds.has(individual.id) || selectedSingleValue === individual.id,
                            [individual.classes]: !!individual.classes
                        }"
                        :tabindex="index === 0 ? 0 : -1"
                        :title="individual.label"
                        class="select-panel-option individual-option cursor-pointer truncate focus:rounded-sm focus:outline-none focus:ring-[.08rem] focus:ring-inset focus:ring-sky-500"
                        @click.prevent="(event) => handleIndividualSelection(event, individual)"
                        @keydown.space.prevent="(event) => handleIndividualSelection(event, individual)"
                        @keydown.enter.prevent="(event) => handleIndividualSelection(event, individual)"
                    >
                        {{ individual[optionNameSelector] }}
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="m-8 text-green-600 text-xl">
        the new text to test tailwind css
    </div>
</template>

<style scoped>
.select-panel-group-options-container::-webkit-scrollbar,
.select-panel-individual-options-container::-webkit-scrollbar {
    display: none;
}

.selected-option {
    @apply text-blue-600 underline underline-offset-4;
}
</style>
