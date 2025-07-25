// ==UserScript==
// @name         Gladiatus Script - JYachelini version
// @version      1.44
// @description  Gladiatus Script
// @author       JYachelini
// @match        *://*.gladiatus.gameforge.com/game/index.php*
// @exclude      *://*.gladiatus.gameforge.com/game/index.php?mod=start
// @downloadURL  https://github.com/JYachelini/gladiatus-script/raw/master/gladiatus-script.user.js
// @updateURL    https://github.com/JYachelini/gladiatus-script/raw/master/gladiatus-script.user.js
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @resource     customCSS_global  https://raw.githubusercontent.com/JYachelini/gladiatus-script/refs/heads/master/global.css
// ==/UserScript==

(function () {
  "use strict";

  // Add CSS

  function addCustomCSS() {
    const globalCSS = GM_getResourceText("customCSS_global");
    GM_addStyle(globalCSS);
  }

  addCustomCSS();

  /*****************
   *     Global     *
   *****************/

  const assetsUrl =
    "https://raw.githubusercontent.com/JYachelini/gladiatus-script/d9bb62a298d39d6f869a791f3dba074140b68250/assets";

  let autoGoActive =
    sessionStorage.getItem("autoGoActive") === "true" ? true : false;

  const currentDate = $("#server-time").html().split(",")[0];

  const player = {
    level: Number($("#header_values_level").first().html()),
    hp: Number(
      $("#header_values_hp_percent")
        .first()
        .html()
        .replace(/[^0-9]/gi, "")
    ),
    gold: Number($("#sstat_gold_val").first().html().replace(/\./g, "")),
  };

  /*****************
   *     Config     *
   *****************/

  // Mode

  let safeMode = false;
  if (localStorage.getItem("safeMode")) {
    safeMode = localStorage.getItem("safeMode") === "true" ? true : false;
  }

  let nextEncounterTime = Number(localStorage.getItem("nextEncounter"));

  // Quests

  let doQuests = true;
  if (localStorage.getItem("doQuests")) {
    doQuests = localStorage.getItem("doQuests") === "true" ? true : false;
  }
  let questTypes = {
    combat: true,
    arena: true,
    circus: true,
    expedition: true,
    dungeon: true,
    items: true,
  };

  let minimumHealth = 20;
  if (localStorage.getItem("minimumHealth")) {
    minimumHealth = Number(localStorage.getItem("minimumHealth"));
  }

  // Auto food
  let doAutoFood = false;
  if (localStorage.getItem("doAutoFood")) {
    doAutoFood = localStorage.getItem("doAutoFood") === "true" ? true : false;
  }
  function isInOverviewPage() {
    return window.location.href.includes("mod=overview");
  }

  function consumeLowestFood() {
    // Si no estamos en overview, buscar y hacer clic en el enlace
    if (!isInOverviewPage()) {
      const overviewLink = document.querySelector(
        "a.menuitem[href*='mod=overview']"
      );
      if (overviewLink) {
        overviewLink.click();
        return; // Detener la ejecución después de hacer clic
      }
    }

    // Click en el personaje principal (usando doll=1)
    const mainCharacter = document.querySelector(
      "div.charmercsel[onclick*='doll=1']"
    );

    // Si no estamos en overview, buscar y hacer clic en el enlace
    if (!isInOverviewPage()) {
      const overviewLink = document.querySelector(
        "a.menuitem[href*='mod=overview']"
      );
      if (overviewLink) {
        overviewLink.click();
        return; // Detener la ejecución después de hacer clic
      }
    }

    if (mainCharacter) {
      if (!mainCharacter.classList.contains("active")) {
        mainCharacter.click();
      }
    }

    setTimeout(() => {
      // Click en el inventario 1
      const inventoryTab = document.querySelector(
        "#inventory_nav a[data-bag-number='512']"
      );
      if (inventoryTab) {
        inventoryTab.click();
        // Esperar un momento para que se cargue el inventario
        setTimeout(() => {
          // Si estamos en modo seguro y la salud está por debajo del mínimo, no consumir comida
          if (safeMode && player.hp <= minimumHealth) {
            console.log("En modo seguro y salud baja, no consumiendo comida");
            return;
          }

          // Buscar todas las comidas en el inventario
          const foodItems = document.querySelectorAll(
            "div[data-vitality-attached='true']"
          );

          if (foodItems.length === 0) {
            setSafeMode(true);
            return;
          }

          // Encontrar la comida que cura menos
          let lowestFood = null;
          let lowestHeal = Infinity;

          foodItems.forEach((item) => {
            const vitality = parseInt(item.getAttribute("data-vitality"));
            if (vitality < lowestHeal) {
              lowestHeal = vitality;
              lowestFood = item;
            }
          });

          if (lowestFood) {
            // Obtener el secure hash y token CSRF
            const secureHash = window.location.search.match(/sh=([^&]+)/)?.[1];
            const csrfToken = document.querySelector(
              'meta[name="csrf-token"]'
            )?.content;

            if (!secureHash || !csrfToken) {
              console.error("No se pudo obtener secure hash o CSRF token");
              return;
            }

            // Obtener las coordenadas de la comida
            const xCoord = parseInt(lowestFood.getAttribute("data-position-x"));
            const yCoord = parseInt(lowestFood.getAttribute("data-position-y"));

            // Preparar los datos para el AJAX
            const params = new URLSearchParams({
              from: 512, // Inventario principal
              fromX: xCoord,
              fromY: yCoord,
              to: 8, // player portrait
              toX: 1,
              toY: 1,
              amount: 1,
              doll: 1,
              sh: secureHash,
            });

            const requestUrl = `ajax.php?mod=inventory&submod=move&${params}`;
            const bodyParams = new URLSearchParams();
            bodyParams.append("a", new Date().getTime());

            // Hacer la petición AJAX
            fetch(requestUrl, {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded; charset=UTF-8",
                "X-CSRF-Token": csrfToken,
                "X-Requested-With": "XMLHttpRequest",
                Origin: window.location.origin,
                Referer: `${window.location.origin}/game/index.php?mod=overview&sh=${secureHash}`,
              },
              body: bodyParams,
              credentials: "include",
            })
              .then((response) => response.text())
              .then((text) => {
                console.log("Raw response:", text);
                try {
                  const data = JSON.parse(text);
                  console.log("Parsed JSON:", data);
                  // Recargar la página después de consumir la comida
                  setTimeout(() => {
                    window.location.reload();
                  }, 1000);
                } catch (e) {
                  console.error("JSON parsing failed", e);
                }
              })
              .catch((error) => {
                console.error("Fetch error:", error);
              });
          }
        }, 500);
      }
    }, 500);
  }

  if (localStorage.getItem("questTypes")) {
    questTypes = JSON.parse(localStorage.getItem("questTypes"));
  }
  let nextQuestTime = 0;
  if (localStorage.getItem("nextQuestTime")) {
    nextQuestTime = Number(localStorage.getItem("nextQuestTime"));
  }

  // Expedition

  let doExpedition = true;
  if (localStorage.getItem("doExpedition")) {
    doExpedition =
      localStorage.getItem("doExpedition") === "true" ? true : false;
  }
  let monsterId = 0;
  if (localStorage.getItem("monsterId")) {
    monsterId = Number(localStorage.getItem("monsterId"));
  }

  // Dungeon

  let doDungeon = true;
  if (localStorage.getItem("doDungeon")) {
    doDungeon = localStorage.getItem("doDungeon") === "true" ? true : false;
  }
  if (player.level < 10) {
    doDungeon = false;
  }
  let dungeonDifficulty =
    localStorage.getItem("dungeonDifficulty") === "advanced"
      ? "advanced"
      : "normal";

  // Arena

  let doArena = true;
  if (localStorage.getItem("doArena")) {
    doArena = localStorage.getItem("doArena") === "true" ? true : false;
  }
  if (player.level < 2) {
    doArena = false;
  }
  let arenaOpponentLevel = "min";
  if (localStorage.getItem("arenaOpponentLevel")) {
    arenaOpponentLevel = localStorage.getItem("arenaOpponentLevel");
  }

  // Circus

  let doCircus = true;
  if (localStorage.getItem("doCircus")) {
    doCircus = localStorage.getItem("doCircus") === "true" ? true : false;
  }
  if (player.level < 10) {
    doCircus = false;
  }
  let circusOpponentLevel = "min";
  if (localStorage.getItem("circusOpponentLevel")) {
    circusOpponentLevel = localStorage.getItem("circusOpponentLevel");
  }

  // Event Expedition

  let doEventExpedition = true;
  if (localStorage.getItem("doEventExpedition")) {
    doEventExpedition =
      localStorage.getItem("doEventExpedition") === "true" ? true : false;
  }
  if (
    !document
      .getElementById("submenu2")
      .getElementsByClassName("menuitem glow")[0]
  ) {
    doEventExpedition = false;
  }

  let eventMonsterId = 0;
  if (localStorage.getItem("eventMonsterId")) {
    eventMonsterId = Number(localStorage.getItem("eventMonsterId"));
  }

  let nextEventExpeditionTime = 0;
  if (localStorage.getItem("nextEventExpeditionTime")) {
    nextEventExpeditionTime = Number(
      localStorage.getItem("nextEventExpeditionTime")
    );
  }

  let eventPoints = 16;
  if (localStorage.getItem("eventPoints")) {
    const savedEventPoints = JSON.parse(localStorage.getItem("eventPoints"));

    if (savedEventPoints.date === currentDate) {
      eventPoints = savedEventPoints.count;
    }
  }

  //Training

  const trainingValuesLinks = {
    str: "skillToTrain=1",
    dex: "skillToTrain=2",
    agi: "skillToTrain=3",
    const: "skillToTrain=4",
    char: "skillToTrain=5",
    int: "skillToTrain=6",
  };

  let doTraining = true;
  if (localStorage.getItem("doTraining")) {
    doTraining = localStorage.getItem("doTraining") === "true" ? true : false;
  }

  let trainingCosts = { str: 0, dex: 0, agi: 0, const: 0, char: 0, int: 0 };

  if (localStorage.getItem("trainingCosts")) {
    trainingCosts = JSON.parse(localStorage.getItem("trainingCosts"));
  }

  let currentTraining = {
    str: 0,
    dex: 0,
    agi: 0,
    const: 0,
    char: 0,
    int: 0,
  };

  if (localStorage.getItem("currentTraining")) {
    currentTraining = JSON.parse(localStorage.getItem("currentTraining"));
  }

  // Inicializar trainingExpectations con valores por defecto
  let trainingExpectations = {
    str: 0,
    dex: 0,
    agi: 0,
    const: 0,
    char: 0,
    int: 0,
  };

  // Si no hay valores guardados en localStorage, usar currentTraining como valores por defecto
  if (!localStorage.getItem("trainingExpectations")) {
    if (currentTraining) {
      trainingExpectations = {
        str: currentTraining.str || 0,
        dex: currentTraining.dex || 0,
        agi: currentTraining.agi || 0,
        const: currentTraining.const || 0,
        char: currentTraining.char || 0,
        int: currentTraining.int || 0,
      };
    }
  } else {
    // Si existen valores guardados, usarlos
    trainingExpectations = JSON.parse(
      localStorage.getItem("trainingExpectations")
    );
  }

  let trainingOrder = {
    str: 1,
    dex: 2,
    agi: 3,
    const: 5,
    char: 4,
    int: 6,
  };

  if (localStorage.getItem("trainingOrder")) {
    trainingOrder = JSON.parse(localStorage.getItem("trainingOrder"));
  }

  /*****************
   *  Translations  *
   *****************/

  const contentEN = {
    advanced: "Advanced",
    arena: "Arena",
    circusTurma: "Circus Turma",
    difficulty: "Difficulty",
    dungeon: "Dungeon",
    eventExpedition: "Event Expedition",
    expedition: "Expedition",
    highest: "Highest",
    in: "In",
    lastUsed: "Last Used",
    location: "Location",
    lowest: "Lowest",
    nextAction: "Next action",
    no: "No",
    normal: "Normal",
    opponent: "Opponent",
    opponentLevel: "Opponent Level",
    quests: "Quests",
    random: "Random",
    settings: "Settings",
    soon: "Soon...",
    type: "Type",
    yes: "Yes",
    training: "Training",
    trainingExpectations: "Training Expectations",
    str: "STR",
    dex: "DEX",
    agi: "AGI",
    char: "CHAR",
    const: "CON",
    int: "INT",
    food: "Food",
    minimumHealth: "Minimum Health",
    safeMode: "Safe Mode",
    autoFood: "Auto Food",
  };

  const contentPL = {
    advanced: "Zaawansowane",
    arena: "Arena",
    circusTurma: "Circus Turma",
    difficulty: "Trudność",
    dungeon: "Lochy",
    eventExpedition: "Wyprawa Eventowa",
    expedition: "Wyprawa",
    highest: "Najwyższy",
    in: "Za",
    lastUsed: "Ostatnio Używana",
    location: "Lokacja",
    lowest: "Najniższy",
    nextAction: "Następna akcja",
    no: "Nie",
    normal: "Normalne",
    opponent: "Przeciwnik",
    opponentLevel: "Poziom Przeciwnika",
    quests: "Zadania",
    random: "Losowy",
    settings: "Ustawienia",
    soon: "Wkrótce...",
    type: "Rodzaj",
    yes: "Tak",
    training: "Trening",
    trainingExpectations: "Oczekiwania Treningowe",
    str: "STR",
    dex: "DEX",
    agi: "AGI",
    char: "CHAR",
    const: "CON",
    int: "INT",
    food: "Jedzenie",
    minimumHealth: "Minimum Health",
    safeMode: "Safe Mode",
    autoFood: "Auto Food",
  };

  const contentES = {
    advanced: "Avanzado",
    arena: "Arena",
    circusTurma: "Circus Turma",
    difficulty: "Dificultad",
    dungeon: "Mazmorra",
    eventExpedition: "Expedición de Evento",
    expedition: "Expedición",
    highest: "Más alto",
    in: "En",
    lastUsed: "Último visitado",
    location: "Localización",
    lowest: "Más bajo",
    nextAction: "Próxima Acción",
    no: "No",
    normal: "Normal",
    opponent: "Oponente",
    opponentLevel: "Nivel de oponente",
    quests: "Misiones",
    random: "Aleatorio",
    settings: "Configuración",
    soon: "Próximamente...",
    type: "Tipo",
    yes: "Si",
    training: "Entrenamiento",
    trainingExpectations: "Expectativas de Entrenamiento",
    str: "STR",
    dex: "DEX",
    agi: "AGI",
    char: "CHAR",
    const: "CON",
    int: "INT",
    food: "Comida",
    minimumHealth: "Salud Mínima",
    safeMode: "Modo Seguro",
    autoFood: "Auto Comida",
  };

  let content;

  const language = localStorage.getItem("settings.language");

  switch (language) {
    case "EN":
      content = { ...contentEN };
      break;
    case "PL":
      content = { ...contentPL };
      break;
    case "ES":
      content = { ...contentES };
      break;
    default:
      content = { ...contentEN };
  }

  /****************
   *   Interface   *
   ****************/

  // Set Auto Go Active
  function setAutoGoActive() {
    sessionStorage.setItem("autoGoActive", true);
    document.getElementById("autoGoButton").innerHTML = "STOP";
    document
      .getElementById("autoGoButton")
      .removeEventListener("click", setAutoGoActive);
    document
      .getElementById("autoGoButton")
      .addEventListener("click", setAutoGoInactive);
    autoGo();
  }

  // Set Auto Go Inactive
  function setAutoGoInactive() {
    sessionStorage.setItem("autoGoActive", false);
    document.getElementById("autoGoButton").innerHTML = "Auto GO";
    document
      .getElementById("autoGoButton")
      .addEventListener("click", setAutoGoActive);
    document
      .getElementById("autoGoButton")
      .removeEventListener("click", setAutoGoInactive);

    clearTimeout(setTimeout);

    if (document.getElementById("nextActionWindow")) {
      document.getElementById("nextActionWindow").remove();
    }

    if (document.getElementById("lowHealth")) {
      document.getElementById("lowHealth").remove();
    }
  }

  function setAutoFood(bool) {
    doAutoFood = bool;
    localStorage.setItem("doAutoFood", bool);
    reloadSettings();
  }

  function setMinimumHealth(value) {
    minimumHealth = parseInt(value);
    localStorage.setItem("minimumHealth", minimumHealth);
    reloadSettings();
  }

  // Safe mode settings
  function setSafeMode(bool) {
    safeMode = bool;
    localStorage.setItem("safeMode", bool);

    reloadSettings();
  }

  function setDoExpedition(bool) {
    doExpedition = bool;
    localStorage.setItem("doExpedition", bool);
    reloadSettings();
  }

  function setDoTraining(bool) {
    doTraining = bool;
    localStorage.setItem("doTraining", bool);
    reloadSettings();
  }

  function setTrainingExpectations(stat, value) {
    trainingExpectations[stat] = value;
    localStorage.setItem(
      "trainingExpectations",
      JSON.stringify(trainingExpectations)
    );
    // Actualizar solo el valor específico que cambió
    $(`#set_training_${stat}`).val(value);
  }

  function setMonster(id) {
    monsterId = id;
    localStorage.setItem("monsterId", id);
    reloadSettings();
  }

  function setDoDungeon(bool) {
    doDungeon = bool;
    localStorage.setItem("doDungeon", bool);
    reloadSettings();
  }

  function setDoArena(bool) {
    doArena = bool;
    localStorage.setItem("doArena", bool);
    reloadSettings();
  }

  function setDungeonDifficulty(difficulty) {
    dungeonDifficulty = difficulty;
    localStorage.setItem("dungeonDifficulty", difficulty);
    reloadSettings();
  }

  function setArenaOpponentLevel(level) {
    arenaOpponentLevel = level;
    localStorage.setItem("arenaOpponentLevel", level);
    reloadSettings();
  }

  function setDoCircus(bool) {
    doCircus = bool;
    localStorage.setItem("doCircus", bool);
    reloadSettings();
  }

  function setCircusOpponentLevel(level) {
    circusOpponentLevel = level;
    localStorage.setItem("circusOpponentLevel", level);
    reloadSettings();
  }

  function setDoEventExpedition(bool) {
    doEventExpedition = bool;
    localStorage.setItem("doEventExpedition", bool);
    reloadSettings();
  }

  function setQuestTypes(type) {
    questTypes[type] = !questTypes[type];
    localStorage.setItem("questTypes", JSON.stringify(questTypes));
    reloadSettings();
  }

  function setDoQuests(bool) {
    doQuests = bool;
    localStorage.setItem("doQuests", bool);
    reloadSettings();
  }

  function setEventMonster(id) {
    eventMonsterId = id;
    localStorage.setItem("eventMonsterId", id);
    reloadSettings();
  }

  function closeSettings() {
    document.getElementById("settingsWindow").remove();
    document.getElementById("overlayBack").remove();
  }

  function reloadSettings() {
    if (document.getElementById("settingsWindow")) {
      closeSettings();
      openSettings();
    }
  }

  function setLanguage(language) {
    localStorage.setItem("settings.language", language);

    switch (language) {
      case "EN":
        content = { ...contentEN };
        break;
      case "PL":
        content = { ...contentPL };
        break;
      case "ES":
        content = { ...contentES };
        break;
      default:
        content = { ...contentEN };
    }

    reloadSettings();
  }

  // Open Settings
  function openSettings() {
    var settingsWindow = document.createElement("div");
    settingsWindow.setAttribute("id", "settingsWindow");
    settingsWindow.innerHTML = `
                <span id="settingsLanguage">
                    <img id="languageEN" src="${assetsUrl}/GB.png">
                    <img id="languagePL" src="${assetsUrl}/PL.png">
                    <img id="languageES" src="${assetsUrl}/ES.png">
                </span>
                <span id="settingsHeader">${content.settings}</span>
                <div id="settingsContent">
                    <div
                        id="expedition_settings"
                        class="settings_box"
                    >
                        <div class="settingsHeaderBig">${content.expedition}</div>
                        <div class="settingsSubcontent">
                            <div id="do_expedition_true" class="settingsButton">${content.yes}</div>
                            <div id="do_expedition_false" class="settingsButton">${content.no}</div>
                        </div>
                        <div class="settingsHeaderSmall">${content.opponent}</div>
                        <div class="settingsSubcontent">
                            <div id="set_monster_id_0" class="settingsButton">1</div>
                            <div id="set_monster_id_1" class="settingsButton">2</div>
                            <div id="set_monster_id_2" class="settingsButton">3</div>
                            <div id="set_monster_id_3" class="settingsButton">Boss</div>
                        </div>
                        <div class="settingsHeaderSmall">${content.location}</div>
                        <div class="settingsSubcontent">
                            <div id="set_expedition_location" class="settingsButton">${content.lastUsed}</div>
                        </div>
                    </div>

                    <div
                        id="dungeon_settings"
                        class="settings_box"
                    >
                        <div class="settingsHeaderBig">${content.dungeon}</div>
                        <div class="settingsSubcontent">
                            <div id="do_dungeon_true" class="settingsButton">${content.yes}</div>
                            <div id="do_dungeon_false" class="settingsButton">${content.no}</div>
                        </div>
                        <div class="settingsHeaderSmall">${content.difficulty}</div>
                        <div class="settingsSubcontent">
                            <div id="set_dungeon_difficulty_normal" class="settingsButton">${content.normal}</div>
                            <div id="set_dungeon_difficulty_advanced" class="settingsButton">${content.advanced}</div>
                        </div>
                        <div class="settingsHeaderSmall">${content.location}</div>
                        <div class="settingsSubcontent">
                            <div id="set_dungeon_location" class="settingsButton">${content.lastUsed}</div>
                        </div>
                    </div>

                    <div
                        id="arena_settings"
                        class="settings_box"
                    >
                        <div class="settingsHeaderBig">${content.arena}</div>
                        <div class="settingsSubcontent">
                            <div id="do_arena_true" class="settingsButton">${content.yes}</div>
                            <div id="do_arena_false" class="settingsButton">${content.no}</div>
                        </div>
                        <div class="settingsHeaderSmall">${content.opponentLevel}</div>
                        <div class="settingsSubcontent">
                            <div id="set_arena_opponent_level_min" class="settingsButton">${content.lowest}</div>
                            <div id="set_arena_opponent_level_max" class="settingsButton">${content.highest}</div>
                            <div id="set_arena_opponent_level_random" class="settingsButton">${content.random}</div>
                        </div>
                    </div>

                    <div
                        id="circus_settings"
                        class="settings_box"
                    >
                        <div class="settingsHeaderBig">${content.circusTurma}</div>
                        <div class="settingsSubcontent">
                            <div id="do_circus_true" class="settingsButton">${content.yes}</div>
                            <div id="do_circus_false" class="settingsButton">${content.no}</div>
                        </div>
                        <div class="settingsHeaderSmall">${content.opponentLevel}</div>
                        <div class="settingsSubcontent">
                            <div id="set_circus_opponent_level_min" class="settingsButton">${content.lowest}</div>
                            <div id="set_circus_opponent_level_max" class="settingsButton">${content.highest}</div>
                            <div id="set_circus_opponent_level_random" class="settingsButton">${content.random}</div>
                        </div>
                    </div>

                    <div
                        id="quests_settings"
                        class="settings_box"
                    >
                        <div class="settingsHeaderBig">${content.quests}</div>
                        <div class="settingsSubcontent">
                            <div id="do_quests_true" class="settingsButton">${content.yes}</div>
                            <div id="do_quests_false" class="settingsButton">${content.no}</div>
                        </div>
                        <div class="settingsHeaderSmall">${content.type}</div>
                        <div class="settingsSubcontent">
                            <div id="do_combat_quests" class="quest-type settingsButton combat"></div>
                            <div id="do_arena_quests" class="quest-type settingsButton arena"></div>
                            <div id="do_circus_quests" class="quest-type settingsButton circus"></div>
                            <div id="do_expedition_quests" class="quest-type settingsButton expedition"></div>
                            <div id="do_dungeon_quests" class="quest-type settingsButton dungeon"></div>
                            <div id="do_items_quests" class="quest-type settingsButton items"></div>
                        </div>
                    </div>

                    <div
                        id="event_expedition_settings"
                        class="settings_box"
                    >
                        <div class="settingsHeaderBig">${content.eventExpedition}</div>
                        <div class="settingsSubcontent">
                            <div id="do_event_expedition_true" class="settingsButton">${content.yes}</div>
                            <div id="do_event_expedition_false" class="settingsButton">${content.no}</div>
                        </div>
                        <div class="settingsHeaderSmall">${content.opponent}</div>
                        <div class="settingsSubcontent">
                            <div id="set_event_monster_id_0" class="settingsButton">1</div>
                            <div id="set_event_monster_id_1" class="settingsButton">2</div>
                            <div id="set_event_monster_id_2" class="settingsButton">3</div>
                            <div id="set_event_monster_id_3" class="settingsButton">Boss</div>
                        </div>
                    </div>

                    <div
                        id="food_settings"
                        class="settings_box"
                    >
                        <div class="settingsHeaderBig">${content.food}</div>
                        <div class="settingsSubcontent">
                            <div id="do_auto_food_true" class="settingsButton">${content.yes}</div>
                            <div id="do_auto_food_false" class="settingsButton">${content.no}</div>
                        </div>
                        <div class="settingsHeaderSmall">${content.minimumHealth}</div>
                        <div class="settingsSubcontent">
                            <input type="number" id="set_minimum_health" value="${minimumHealth}">
                        </div>
                    </div>

                    <div
                        id="safe_mode_settings"
                        class="settings_box"
                    >
                        <div class="settingsHeaderBig">${content.safeMode}</div>
                        <div class="settingsSubcontent">
                            <div id="do_safe_mode_true" class="settingsButton">${content.yes}</div>
                            <div id="do_safe_mode_false" class="settingsButton">${content.no}</div>
                        </div>
                    </div>

                    <div
                        id="training_settings"
                        class="settings_box"
                    >
                        <div class="settingsHeaderBig">${content.training}</div>
                        <div class="settingsSubcontent">
                            <div id="do_training_true" class="settingsButton">${content.yes}</div>
                            <div id="do_training_false" class="settingsButton">${content.no}</div>
                        </div>
                        <div class="settingsHeaderSmall">${content.trainingExpectations}</div>
                        <div class="settingsSubcontent">
                            <div class="stat-input-container">
                                <span>${content.str}</span>
                                <input type="number" id="set_training_str" value="${trainingExpectations.str}">
                            </div>
                            <div class="stat-input-container">
                                <span>${content.dex}</span>
                                <input type="number" id="set_training_dex" value="${trainingExpectations.dex}">
                            </div>
                            <div class="stat-input-container">
                                <span>${content.agi}</span>
                                <input type="number" id="set_training_agi" value="${trainingExpectations.agi}">
                            </div>
                            <div class="stat-input-container">
                                <span>${content.const}</span>
                                <input type="number" id="set_training_const" value="${trainingExpectations.const}">
                            </div>
                            <div class="stat-input-container">
                                <span>${content.char}</span>
                                <input type="number" id="set_training_char" value="${trainingExpectations.char}">
                            </div>
                            <div class="stat-input-container">
                                <span>${content.int}</span>
                                <input type="number" id="set_training_int" value="${trainingExpectations.int}">
                            </div>
                        </div>
                    </div>
                </div>`;
    document
      .getElementById("header_game")
      .insertBefore(
        settingsWindow,
        document.getElementById("header_game").children[0]
      );

    var overlayBack = document.createElement("div");
    const wrapperHeight = document.getElementById("wrapper_game").clientHeight;
    overlayBack.setAttribute("id", "overlayBack");
    overlayBack.setAttribute("style", `height: ${wrapperHeight}px;`);
    overlayBack.addEventListener("click", function (e) {
      e.preventDefault();
      closeSettings();
    });
    overlayBack.addEventListener("touchstart", function (e) {
      e.preventDefault();
      closeSettings();
    });
    document.getElementsByTagName("body")[0].appendChild(overlayBack);

    // Set Language
    $("#languageEN").on("click touchstart", function (e) {
      e.preventDefault();
      setLanguage("EN");
    });
    $("#languagePL").on("click touchstart", function (e) {
      e.preventDefault();
      setLanguage("PL");
    });
    $("#languageES").on("click touchstart", function (e) {
      e.preventDefault();
      setLanguage("ES");
    });

    // Change Settings

    // Food settings

    $("#do_expedition_true").on("click touchstart", function (e) {
      e.preventDefault();
      setDoExpedition(true);
    });
    $("#do_expedition_false").on("click touchstart", function (e) {
      e.preventDefault();
      setDoExpedition(false);
    });

    $("#do_expedition_true").click(function () {
      setDoExpedition(true);
    });
    $("#do_expedition_false").click(function () {
      setDoExpedition(false);
    });

    $("#set_training_str").on("blur keyup touchend", function (e) {
      e.preventDefault();
      if (e.type === "keyup" && e.key !== "Enter") return;
      const value = parseInt($(this).val());
      if (!isNaN(value)) {
        setTrainingExpectations("str", value);
      }
    });
    $("#set_training_dex").on("blur keyup touchend", function (e) {
      e.preventDefault();
      if (e.type === "keyup" && e.key !== "Enter") return;
      const value = parseInt($(this).val());
      if (!isNaN(value)) {
        setTrainingExpectations("dex", value);
      }
    });
    $("#set_training_agi").on("blur keyup touchend", function (e) {
      e.preventDefault();
      if (e.type === "keyup" && e.key !== "Enter") return;
      const value = parseInt($(this).val());
      if (!isNaN(value)) {
        setTrainingExpectations("agi", value);
      }
    });
    $("#set_training_const").on("blur keyup touchend", function (e) {
      e.preventDefault();
      if (e.type === "keyup" && e.key !== "Enter") return;
      const value = parseInt($(this).val());
      if (!isNaN(value)) {
        setTrainingExpectations("const", value);
      }
    });
    $("#set_training_char").on("blur keyup touchend", function (e) {
      e.preventDefault();
      if (e.type === "keyup" && e.key !== "Enter") return;
      const value = parseInt($(this).val());
      if (!isNaN(value)) {
        setTrainingExpectations("char", value);
      }
    });
    $("#set_training_int").on("blur keyup touchend", function (e) {
      e.preventDefault();
      if (e.type === "keyup" && e.key !== "Enter") return;
      const value = parseInt($(this).val());
      if (!isNaN(value)) {
        setTrainingExpectations("int", value);
      }
    });

    $("#set_monster_id_0").on("click touchstart", function (e) {
      e.preventDefault();
      setMonster("0");
    });
    $("#set_monster_id_1").on("click touchstart", function (e) {
      e.preventDefault();
      setMonster("1");
    });
    $("#set_monster_id_2").on("click touchstart", function (e) {
      e.preventDefault();
      setMonster("2");
    });
    $("#set_monster_id_3").on("click touchstart", function (e) {
      e.preventDefault();
      setMonster("3");
    });

    $("#do_dungeon_true").on("click touchstart", function (e) {
      e.preventDefault();
      setDoDungeon(true);
    });
    $("#do_dungeon_false").on("click touchstart", function (e) {
      e.preventDefault();
      setDoDungeon(false);
    });

    $("#set_dungeon_difficulty_normal").on("click touchstart", function (e) {
      e.preventDefault();
      setDungeonDifficulty("normal");
    });
    $("#set_dungeon_difficulty_advanced").on("click touchstart", function (e) {
      e.preventDefault();
      setDungeonDifficulty("advanced");
    });

    $("#do_arena_true").on("click touchstart", function (e) {
      e.preventDefault();
      setDoArena(true);
    });
    $("#do_arena_false").on("click touchstart", function (e) {
      e.preventDefault();
      setDoArena(false);
    });

    $("#do_auto_food_true").on("click touchstart", function (e) {
      e.preventDefault();
      setAutoFood(true);
    });
    $("#do_auto_food_false").on("click touchstart", function (e) {
      e.preventDefault();
      setAutoFood(false);
    });

    $("#set_minimum_health").on("blur keyup touchend", function (e) {
      e.preventDefault();
      if (e.type === "keyup" && e.key !== "Enter") return;
      const value = parseInt($(this).val());
      if (!isNaN(value)) {
        setMinimumHealth(value);
      }
    });

    $("#do_safe_mode_true").on("click touchstart", function (e) {
      e.preventDefault();
      setSafeMode(true);
    });
    $("#do_safe_mode_false").on("click touchstart", function (e) {
      e.preventDefault();
      setSafeMode(false);
    });

    $("#do_training_true").on("click touchstart", function (e) {
      e.preventDefault();
      setDoTraining(true);
    });
    $("#do_training_false").on("click touchstart", function (e) {
      e.preventDefault();
      setDoTraining(false);
    });

    $("#set_arena_opponent_level_min").on("click touchstart", function (e) {
      e.preventDefault();
      setArenaOpponentLevel("min");
    });
    $("#set_arena_opponent_level_max").on("click touchstart", function (e) {
      e.preventDefault();
      setArenaOpponentLevel("max");
    });
    $("#set_arena_opponent_level_random").on("click touchstart", function (e) {
      e.preventDefault();
      setArenaOpponentLevel("random");
    });

    $("#do_circus_true").on("click touchstart", function (e) {
      e.preventDefault();
      setDoCircus(true);
    });
    $("#do_circus_false").on("click touchstart", function (e) {
      e.preventDefault();
      setDoCircus(false);
    });

    $("#set_circus_opponent_level_min").on("click touchstart", function (e) {
      e.preventDefault();
      setCircusOpponentLevel("min");
    });
    $("#set_circus_opponent_level_max").on("click touchstart", function (e) {
      e.preventDefault();
      setCircusOpponentLevel("max");
    });
    $("#set_circus_opponent_level_random").on("click touchstart", function (e) {
      e.preventDefault();
      setCircusOpponentLevel("random");
    });

    $("#do_quests_true").on("click touchstart", function (e) {
      e.preventDefault();
      setDoQuests(true);
    });
    $("#do_quests_false").on("click touchstart", function (e) {
      e.preventDefault();
      setDoQuests(false);
    });

    $("#do_combat_quests").on("click touchstart", function (e) {
      e.preventDefault();
      setQuestTypes("combat");
    });
    $("#do_arena_quests").on("click touchstart", function (e) {
      e.preventDefault();
      setQuestTypes("arena");
    });
    $("#do_circus_quests").on("click touchstart", function (e) {
      e.preventDefault();
      setQuestTypes("circus");
    });
    $("#do_expedition_quests").on("click touchstart", function (e) {
      e.preventDefault();
      setQuestTypes("expedition");
    });
    $("#do_dungeon_quests").on("click touchstart", function (e) {
      e.preventDefault();
      setQuestTypes("dungeon");
    });
    $("#do_items_quests").on("click touchstart", function (e) {
      e.preventDefault();
      setQuestTypes("items");
    });

    $("#do_event_expedition_true").on("click touchstart", function (e) {
      e.preventDefault();
      setDoEventExpedition(true);
    });
    $("#do_event_expedition_false").on("click touchstart", function (e) {
      e.preventDefault();
      setDoEventExpedition(false);
    });

    $("#set_event_monster_id_0").on("click touchstart", function (e) {
      e.preventDefault();
      setEventMonster("0");
    });
    $("#set_event_monster_id_1").on("click touchstart", function (e) {
      e.preventDefault();
      setEventMonster("1");
    });
    $("#set_event_monster_id_2").on("click touchstart", function (e) {
      e.preventDefault();
      setEventMonster("2");
    });
    $("#set_event_monster_id_3").on("click touchstart", function (e) {
      e.preventDefault();
      setEventMonster("3");
    });

    function setActiveButtons() {
      $("#expedition_settings").addClass(doExpedition ? "active" : "inactive");
      $(`#do_expedition_${doExpedition}`).addClass("active");
      $(`#set_monster_id_${monsterId}`).addClass("active");

      $("#dungeon_settings").addClass(doDungeon ? "active" : "inactive");
      $(`#do_dungeon_${doDungeon}`).addClass("active");
      $(`#set_dungeon_difficulty_${dungeonDifficulty}`).addClass("active");

      $("#arena_settings").addClass(doArena ? "active" : "inactive");
      $(`#do_arena_${doArena}`).addClass("active");
      $(`#set_arena_opponent_level_${arenaOpponentLevel}`).addClass("active");

      $("#circus_settings").addClass(doCircus ? "active" : "inactive");
      $(`#do_circus_${doCircus}`).addClass("active");
      $(`#set_circus_opponent_level_${circusOpponentLevel}`).addClass("active");

      $("#quests_settings").addClass(doQuests ? "active" : "inactive");
      $(`#do_quests_${doQuests}`).addClass("active");

      for (const type in questTypes) {
        if (questTypes[type]) {
          $(`#do_${type}_quests`).addClass("active");
        }
      }

      $("#event_expedition_settings").addClass(
        doEventExpedition ? "active" : "inactive"
      );
      $(`#do_event_expedition_${doEventExpedition}`).addClass("active");
      $(`#set_event_monster_id_${eventMonsterId}`).addClass("active");

      // Training settings
      $("#training_settings").addClass(doTraining ? "active" : "inactive");
      $(`#do_training_${doTraining}`).addClass("active");

      // Food settings
      $("#food_settings").addClass(doAutoFood ? "active" : "inactive");
      $(`#do_auto_food_${doAutoFood}`).addClass("active");

      // Safe mode settings
      $("#safe_mode_settings").addClass(safeMode ? "active" : "inactive");
      $(`#do_safe_mode_${safeMode}`).addClass("active");
    }

    setActiveButtons();
  }

  // Auto GO button
  var autoGoButton = document.createElement("button");
  autoGoButton.setAttribute("id", "autoGoButton");
  autoGoButton.className = "menuitem";
  autoGoButton.style = "cursor: pointer;";

  if (autoGoActive == false) {
    autoGoButton.innerHTML = "Auto GO";
    autoGoButton.addEventListener("click", function (e) {
      e.preventDefault();
      setAutoGoActive();
    });
    autoGoButton.addEventListener("touchstart", function (e) {
      e.preventDefault();
      setAutoGoActive();
    });
  } else {
    autoGoButton.innerHTML = "STOP";
    autoGoButton.addEventListener("click", function (e) {
      e.preventDefault();
      setAutoGoInactive();
    });
    autoGoButton.addEventListener("touchstart", function (e) {
      e.preventDefault();
      setAutoGoInactive();
    });
  }

  document
    .getElementById("mainmenu")
    .insertBefore(
      autoGoButton,
      document.getElementById("mainmenu").children[0]
    );

  // Settings button
  var settingsButton = document.createElement("button");
  settingsButton.className = "menuitem";
  settingsButton.innerHTML = `<img src="${assetsUrl}/cog.svg" title="Ustawienia" height="20" width="20" style="filter: invert(83%) sepia(52%) saturate(503%) hue-rotate(85deg) brightness(103%) contrast(101%); z-index: 999;">`;
  settingsButton.setAttribute(
    "style",
    "display: flex; justify-content: center; align-items: center; height: 27px; width: 27px; cursor: pointer; border: none; color: #5dce5d; padding: 0; background-image: url('https://i.imgur.com/jf7BXTX.png')"
  );
  settingsButton.addEventListener("click", function (e) {
    e.preventDefault();
    openSettings();
  });
  settingsButton.addEventListener("touchstart", function (e) {
    e.preventDefault();
    openSettings();
  });
  document
    .getElementById("mainmenu")
    .insertBefore(
      settingsButton,
      document.getElementById("mainmenu").children[1]
    );

  /****************
   *    Helpers    *
   ****************/

  function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getSmallestIntIndex(values) {
    let index = 0;
    let minValue = values[0];

    for (let i = 1; i < values.length; i++) {
      if (values[i] < minValue) {
        minValue = values[i];
        index = i;
      }
    }
    return index;
  }

  function getLargestIntIndex(values) {
    let index = 0;
    let maxValue = values[0];

    for (let i = 1; i < values.length; i++) {
      if (values[i] > maxValue) {
        maxValue = values[i];
        index = i;
      }
    }
    return index;
  }

  function getRandomIntIndex(values) {
    const index = Math.floor(Math.random() * values.length);

    return index;
  }

  function convertTimeToMs(t) {
    const ms =
      Number(t.split(":")[0]) * 60 * 60 * 1000 +
      Number(t.split(":")[1]) * 60 * 1000 +
      Number(t.split(":")[2]) * 1000;

    return ms;
  }

  /****************
   *    Auto Go    *
   ****************/

  // Function to extract training values
  function extractTrainingCosts() {
    const trainingBox = document.querySelector("#training_box");
    if (trainingBox) {
      const trainingValues = trainingBox.querySelectorAll(
        ".training_costs span"
      );
      trainingValues.forEach((value, i) => {
        const content = value.textContent.trim().replace(/\./g, "");

        switch (i) {
          case 0:
            trainingCosts.str = parseInt(content, 10);
            break;
          case 1:
            trainingCosts.dex = parseInt(content, 10);
            break;
          case 2:
            trainingCosts.agi = parseInt(content, 10);
            break;
          case 3:
            trainingCosts.const = parseInt(content, 10);
            break;
          case 4:
            trainingCosts.char = parseInt(content, 10);
            break;
          case 5:
            trainingCosts.int = parseInt(content, 10);
            break;
        }
      });
      localStorage.setItem("trainingCosts", JSON.stringify(trainingCosts));
    }
  }

  function extractTrainingValues() {
    const trainingBox = document.querySelector("#training_box");
    if (trainingBox) {
      const trainingValues = trainingBox.querySelectorAll(
        "#char_f0 > div:first-child, " +
          "#char_f1 > div:first-child, " +
          "#char_f2 > div:first-child, " +
          "#char_f3 > div:first-child, " +
          "#char_f4 > div:first-child, " +
          "#char_f5 > div:first-child"
      );
      trainingValues.forEach((value, i) => {
        const content = value.textContent
          .trim()
          .split("+")[0]
          .trim()
          .replace(/\./g, "");

        switch (i) {
          case 0:
            currentTraining.str = parseInt(content, 10);
            break;
          case 1:
            currentTraining.dex = parseInt(content, 10);
            break;
          case 2:
            currentTraining.agi = parseInt(content, 10);
            break;
          case 3:
            currentTraining.const = parseInt(content, 10);
            break;
          case 4:
            currentTraining.char = parseInt(content, 10);
            break;
          case 5:
            currentTraining.int = parseInt(content, 10);
            break;
        }
      });
      localStorage.setItem("currentTraining", JSON.stringify(currentTraining));
      localStorage.setItem("trainingCosts", JSON.stringify(trainingCosts));
    }
  }

  // function get next stat to train
  function getNextStatToTrain() {
    // Get all stats in order of priority
    const stats = ["str", "dex", "agi", "const", "char", "int"];

    // Sort stats by priority order
    stats.sort((a, b) => trainingOrder[a] - trainingOrder[b]);

    // Filter stats that need to be trained
    const statsToTrain = stats.filter(
      (stat) => currentTraining[stat] < trainingExpectations[stat]
    );

    if (statsToTrain.length === 0) {
      return null; // No stats need training
    }

    // If only one stat needs training, return it
    if (statsToTrain.length === 1) {
      return statsToTrain[0];
    }

    // Get the costs of the first two stats that need training
    const firstStat = statsToTrain[0];
    const secondStat = statsToTrain[1];
    const firstCost = trainingCosts[firstStat];
    const secondCost = trainingCosts[secondStat];

    // If the first stat costs more than double the second stat, return the second stat
    if (firstCost > secondCost * 2) {
      return secondStat;
    }

    // Otherwise, return the first stat
    return firstStat;
  }

  function autoGo() {
    // Variables

    const currentTime = new Date().getTime();
    const clickDelay = getRandomInt(900, 2400);

    // Claim Daily Reward

    if (document.getElementById("blackoutDialogLoginBonus") !== null) {
      setTimeout(function () {
        document
          .getElementById("blackoutDialogLoginBonus")
          .getElementsByTagName("input")[0]
          .click();
      }, clickDelay);
    }

    // Close Notifications

    if (
      document.getElementById("blackoutDialognotification") !== null &&
      document.getElementById("blackoutDialognotification").isDisplayed()
    ) {
      setTimeout(function () {
        document
          .getElementById("blackoutDialognotification")
          .getElementsByTagName("input")[0]
          .click();
      }, clickDelay);
    }
    const lootModal = document.querySelector(".loot-modal");

    if (lootModal) {
      // If it exists, find all buttons with the class 'loot-button' within it
      const lootButtons = lootModal.querySelectorAll(".loot-button");

      // Check if there are at least three buttons
      if (lootButtons.length >= 3) {
        // Click the third button (index 2 because arrays are 0-indexed)
        lootButtons[2].click();
      } else {
        console.log(
          "Not enough 'loot-button' elements found within the 'loot-modal'."
        );
      }
    } else {
      console.log("The 'loot-modal' div does not exist.");
    }

    // Verificar si estamos en la página de entrenamiento

    if (doTraining) {
      const isPageTraining = window.location.href.includes("mod=training");
      if (!isPageTraining) {
        const trainingLink = document.querySelector('a[href*="mod=training"]');
        if (
          !trainingCosts.dex ||
          !trainingCosts.agi ||
          !trainingCosts.char ||
          !trainingCosts.str ||
          !trainingCosts.const ||
          !trainingCosts.int
        ) {
          if (trainingLink) {
            trainingLink.click();
          }
        }
      } else {
        extractTrainingValues();
        extractTrainingCosts();
      }

      const nextStatToTrain = getNextStatToTrain();
      console.log(nextStatToTrain);

      if (nextStatToTrain) {
        const goldNeeded = trainingCosts[nextStatToTrain];
        const goldAvailable = player.gold;
        console.log(goldNeeded, goldAvailable);

        if (goldAvailable >= goldNeeded) {
          if (!isPageTraining) {
            const trainingLink = document.querySelector(
              'a[href*="mod=training"]'
            );
            if (trainingLink) {
              trainingLink.click();
            }
          } else {
            const trainingLink = document.querySelector(
              'a[href*="mod=training&submod=train&' +
                trainingValuesLinks[nextStatToTrain] +
                '"]'
            );
            if (trainingLink) {
              trainingLink.click();
            }
          }
        }
      }
    }

    /***************
     *   Use Food   *
     ***************/

    if (player.hp < minimumHealth) {
      // No activar modo seguro automáticamente cuando la salud es baja
      // Solo mostrar alerta si no está en modo seguro
      /*
      if (!safeMode) {
        console.log("Low health");

        var lowHealthAlert = document.createElement("div");

        function showLowHealthAlert() {
          lowHealthAlert.setAttribute("id", "lowHealth");
          lowHealthAlert.setAttribute(
            "style",
            `
                    display: block;
                    position: absolute;
                    top: 120px;
                    left: 506px;
                    width: 365px;
                    padding: 20px 0;
                    color: #ea1414;
                    background-color: #000000db;
                    font-size: 20px;
                    border-radius: 25px;
                    border-left: 10px solid #ea1414;
                    border-right: 10px solid #ea1414;
                    z-index: 999;
                `
          );
          lowHealthAlert.innerHTML = "<span>Low Health!</span>";
          document
            .getElementById("header_game")
            .insertBefore(
              lowHealthAlert,
              document.getElementById("header_game").children[0]
            );
        }
        showLowHealthAlert();
      }*/

      // Solo consumir comida si no está en modo seguro
      if (doAutoFood && !safeMode) {
        consumeLowestFood();
      }

      if (safeMode) {
        setDoExpedition(false);
        setDoArena(false);
        setDoEventExpedition(false);
      }
      // No activar modo seguro automáticamente por baja salud
    }

    if (doQuests === true && nextQuestTime < currentTime) {
      /****************
       * Handle Quests *
       ****************/
      function completeQuests() {
        const inPanteonPage = $("body").first().attr("id") === "questsPage";

        if (!inPanteonPage) {
          $("#mainmenu a.menuitem")[1].click();
        } else {
          const completedQuests = $(
            "#content .contentboard_slot a.quest_slot_button_finish"
          );
          console.log(completedQuests);

          if (completedQuests.length) {
            completedQuests[0].click();
          } else {
            repeatQuests();
          }
        }
      }

      function repeatQuests() {
        const failedQuests = $(
          "#content .contentboard_slot a.quest_slot_button_restart"
        );

        if (failedQuests.length) {
          failedQuests[0].click();
        } else {
          takeQuest();
        }
      }

      function takeQuest() {
        const canTakeQuest = $(
          "#content .contentboard_slot a.quest_slot_button_accept"
        );
        console.log(canTakeQuest);

        if (canTakeQuest.length) {
          function getIconName(url) {
            if (url.includes("icon_grouparena_inactive")) {
              return "circus";
            }

            if (url.includes("icon_dungeon_inactive")) {
              return "dungeon";
            }

            if (url.includes("icon_combat_inactive")) {
              return "combat";
            }

            if (url.includes("icon_items_inactive")) {
              return "items";
            }

            if (url.includes("icon_arena_inactive")) {
              return "arena";
            }

            if (url.includes("icon_expedition_inactive")) {
              return "expedition";
            }
            return null;
          }

          const availableQuests = $("#content .contentboard_slot_inactive");

          for (const quest of availableQuests) {
            let icon = getIconName(
              quest.getElementsByClassName("quest_slot_icon")[0].style
                .backgroundImage
            );

            if (!icon) {
              console.log("No quest was found");
            }

            if (questTypes[icon]) {
              return quest
                .getElementsByClassName("quest_slot_button_accept")[0]
                .click();
            }
          }

          $("#quest_footer_reroll input").first().click();
        }

        checkNextQuestTime();
      }

      function checkNextQuestTime() {
        const isTimer = $("#quest_header_cooldown");

        if (isTimer.length) {
          const nextQuestIn = Number(
            $("#quest_header_cooldown b span").attr("data-ticker-time-left")
          );

          nextQuestTime = currentTime + nextQuestIn;
          localStorage.setItem("nextQuestTime", nextQuestTime);
        } else {
          nextQuestTime = currentTime + 5000;
          localStorage.setItem("nextQuestTime", nextQuestTime);
        }

        autoGo();
      }

      setTimeout(function () {
        completeQuests();
      }, clickDelay);
    } else if (
      /****************
       * Go Expedition *
       ****************/
      doExpedition === true &&
      document
        .getElementById("cooldown_bar_fill_expedition")
        .classList.contains("cooldown_bar_fill_ready") === true
    ) {
      function goExpedition() {
        const inExpeditionPage =
          $("body").first().attr("id") === "locationPage";
        const inEventExpeditionPage =
          document
            .getElementById("content")
            .getElementsByTagName("img")[1]
            .getAttribute("src") === "img/ui/expedition_points2.png";

        if (!inExpeditionPage || inEventExpeditionPage) {
          document.getElementsByClassName("cooldown_bar_link")[0].click();
        } else {
          document
            .getElementsByClassName("expedition_button")
            [monsterId].click();
        }
      }

      setTimeout(function () {
        goExpedition();
      }, clickDelay);
    } else if (
      /**************
       * Go Dungeon  *
       **************/
      doDungeon === true &&
      document
        .getElementById("cooldown_bar_fill_dungeon")
        .classList.contains("cooldown_bar_fill_ready") === true
    ) {
      function goDungeon() {
        const inDungeonPage = $("body").first().attr("id") === "dungeonPage";

        if (!inDungeonPage) {
          document.getElementsByClassName("cooldown_bar_link")[1].click();
        } else {
          const inSelectDifficultyPage = !document
            .getElementById("content")
            .getElementsByTagName("area")[0];

          if (inSelectDifficultyPage) {
            if (dungeonDifficulty === "advanced") {
              document
                .getElementById("content")
                .getElementsByClassName("button1")[1]
                .click();
            } else {
              document
                .getElementById("content")
                .getElementsByClassName("button1")[0]
                .click();
            }
          } else {
            document
              .getElementById("content")
              .getElementsByTagName("area")[0]
              .click();
          }
        }
      }

      setTimeout(function () {
        goDungeon();
      }, clickDelay);
    } else if (
      /************************
       * Go Arena Provinciarum *
       ************************/
      doArena === true &&
      document
        .getElementById("cooldown_bar_fill_arena")
        .classList.contains("cooldown_bar_fill_ready") === true
    ) {
      function goArena() {
        const inArenaPage =
          document.getElementsByTagName("body")[0].id === "arenaPage";

        if (!inArenaPage && player.level < 10) {
          document.getElementsByClassName("cooldown_bar_link")[1].click();
        } else if (!inArenaPage) {
          document.getElementsByClassName("cooldown_bar_link")[2].click();
        } else {
          const inArenaProvPage = document
            .getElementById("mainnav")
            .getElementsByTagName("td")[1]
            .firstChild.hasClass("awesome-tabs current");

          if (!inArenaProvPage) {
            document
              .getElementById("mainnav")
              .getElementsByTagName("td")[1]
              .firstElementChild.click();
          } else {
            const levels = new Array();
            levels[0] = Number(
              document.getElementById("own2").getElementsByTagName("td")[1]
                .firstChild.nodeValue
            );
            levels[1] = Number(
              document.getElementById("own2").getElementsByTagName("td")[5]
                .firstChild.nodeValue
            );
            levels[2] = Number(
              document.getElementById("own2").getElementsByTagName("td")[9]
                .firstChild.nodeValue
            );
            levels[3] = Number(
              document.getElementById("own2").getElementsByTagName("td")[13]
                .firstChild.nodeValue
            );
            levels[4] = Number(
              document.getElementById("own2").getElementsByTagName("td")[17]
                .firstChild.nodeValue
            );

            let opponentIndex;

            if (arenaOpponentLevel === "min") {
              opponentIndex = getSmallestIntIndex(levels);
            } else if (arenaOpponentLevel === "max") {
              opponentIndex = getLargestIntIndex(levels);
            } else {
              opponentIndex = getRandomIntIndex(levels);
            }

            document.getElementsByClassName("attack")[opponentIndex].click();
          }
        }
      }

      setTimeout(function () {
        goArena();
      }, clickDelay + 600);
    } else if (
      /*************************
       * Go Circus Provinciarum *
       *************************/
      doCircus === true &&
      document
        .getElementById("cooldown_bar_fill_ct")
        .classList.contains("cooldown_bar_fill_ready") === true
    ) {
      function goCircus() {
        const inArenaPage =
          document.getElementsByTagName("body")[0].id === "arenaPage";

        if (!inArenaPage) {
          document.getElementsByClassName("cooldown_bar_link")[3].click();
        } else {
          const inCircusProvPage = document
            .getElementById("mainnav")
            .getElementsByTagName("td")[3]
            .firstChild.hasClass("awesome-tabs current");

          if (!inCircusProvPage) {
            document
              .getElementById("mainnav")
              .getElementsByTagName("td")[3]
              .firstElementChild.click();
          } else {
            const levels = new Array();
            levels[0] = Number(
              document.getElementById("own3").getElementsByTagName("td")[1]
                .firstChild.nodeValue
            );
            levels[1] = Number(
              document.getElementById("own3").getElementsByTagName("td")[5]
                .firstChild.nodeValue
            );
            levels[2] = Number(
              document.getElementById("own3").getElementsByTagName("td")[9]
                .firstChild.nodeValue
            );
            levels[3] = Number(
              document.getElementById("own3").getElementsByTagName("td")[13]
                .firstChild.nodeValue
            );
            levels[4] = Number(
              document.getElementById("own3").getElementsByTagName("td")[17]
                .firstChild.nodeValue
            );

            let opponentIndex;

            if (circusOpponentLevel === "min") {
              opponentIndex = getSmallestIntIndex(levels);
            } else if (circusOpponentLevel === "max") {
              opponentIndex = getLargestIntIndex(levels);
            } else {
              opponentIndex = getRandomIntIndex(levels);
            }

            document.getElementsByClassName("attack")[opponentIndex].click();

            // added if reached 5 figths
            setTimeout(function () {
              const retry = document.getElementById("linkbod");
              if (retry) retry.click();
            }, clickDelay + 100);
          }
        }
      }

      setTimeout(function () {
        goCircus();
      }, clickDelay + 600);
    } else if (
      /************************
       *  Go Event Expedition  *
       ************************/
      doEventExpedition === true &&
      nextEventExpeditionTime < currentTime &&
      eventPoints > 0
    ) {
      function goEventExpedition() {
        const inEventExpeditionPage = document
          .getElementById("submenu2")
          .getElementsByClassName("menuitem active glow")[0];

        if (!inEventExpeditionPage) {
          document
            .getElementById("submenu2")
            .getElementsByClassName("menuitem glow")[0]
            .click();
        } else {
          eventPoints = document
            .getElementById("content")
            .getElementsByClassName("section-header")[0]
            .getElementsByTagName("p")[1]
            .firstChild.nodeValue.replace(/[^0-9]/gi, "");
          localStorage.setItem(
            "eventPoints",
            JSON.stringify({ count: eventPoints, date: currentDate })
          );

          const isTimer = $("#content .ticker").first();

          if (isTimer.length) {
            nextEventExpeditionTime =
              currentTime +
              Number(
                $("#content .ticker").first().attr("data-ticker-time-left")
              );
            localStorage.setItem(
              "nextEventExpeditionTime",
              nextEventExpeditionTime
            );

            location.reload();
          } else if (eventPoints == 0) {
            location.reload();
          } else if (eventPoints == 1 && eventMonsterId == 3) {
            localStorage.setItem(
              "eventPoints",
              JSON.stringify({ count: 0, date: currentDate })
            );

            document.getElementsByClassName("expedition_button")[2].click();
          } else {
            if (eventMonsterId == 3) {
              localStorage.setItem(
                "eventPoints",
                JSON.stringify({ count: eventPoints - 2, date: currentDate })
              );
            } else {
              localStorage.setItem(
                "eventPoints",
                JSON.stringify({ count: eventPoints - 1, date: currentDate })
              );
            }

            nextEventExpeditionTime = currentTime + 303000;
            localStorage.setItem(
              "nextEventExpeditionTime",
              nextEventExpeditionTime
            );

            document
              .getElementsByClassName("expedition_button")
              [eventMonsterId].click();
          }
        }
      }

      setTimeout(function () {
        goEventExpedition();
      }, clickDelay);
    } else {
      /***********************
       * Wait for Next Action *
       ***********************/
      /******************
       *    Fast Mode    *
       ******************/

      const actions = [];

      if (doExpedition === true) {
        const timeTo = convertTimeToMs(
          document.getElementById("cooldown_bar_text_expedition").innerText
        );

        actions.push({
          name: "expedition",
          time: timeTo,
          index: 0,
        });
      }

      if (doDungeon === true) {
        const timeTo = convertTimeToMs(
          document.getElementById("cooldown_bar_text_dungeon").innerText
        );

        actions.push({
          name: "dungeon",
          time: timeTo,
          index: 1,
        });
      }

      if (doArena === true) {
        const timeTo = convertTimeToMs(
          document.getElementById("cooldown_bar_text_arena").innerText
        );

        actions.push({
          name: "arena",
          time: timeTo,
          index: 2,
        });
      }

      if (doCircus === true) {
        const timeTo = convertTimeToMs(
          document.getElementById("cooldown_bar_text_ct").innerText
        );

        actions.push({
          name: "circusTurma",
          time: timeTo,
          index: 3,
        });
      }

      if (doEventExpedition === true && eventPoints > 0) {
        const timeTo =
          localStorage.getItem("nextEventExpeditionTime") - currentTime;

        actions.push({
          name: "eventExpedition",
          time: timeTo,
          index: 4,
        });
      }

      function getNextAction(actions) {
        let index = 0;
        let minValue = actions[0].time;

        for (let i = 1; i < actions.length; i++) {
          if (actions[i].time < minValue) {
            minValue = actions[i].time;
            index = i;
          }
        }
        return actions[index];
      }

      const nextAction = getNextAction(actions);

      // @TODO fix nextAction if !actions.length

      function formatTime(timeInMs) {
        if (timeInMs < 1000) {
          return "0:00:00";
        }

        let timeInSecs = timeInMs / 1000;
        timeInSecs = Math.round(timeInSecs);
        let secs = timeInSecs % 60;
        if (secs < 10) {
          secs = "0" + secs;
        }
        timeInSecs = (timeInSecs - secs) / 60;
        let mins = timeInSecs % 60;
        if (mins < 10) {
          mins = "0" + mins;
        }
        let hrs = (timeInSecs - mins) / 60;

        return hrs + ":" + mins + ":" + secs;
      }

      var nextActionWindow = document.createElement("div");

      function showNextActionWindow() {
        nextActionWindow.setAttribute("id", "nextActionWindow");
        nextActionWindow.setAttribute(
          "style",
          `
                        display: block;
                        position: absolute;
                        top: 120px;
                        left: 506px;
                        height: 72px;
                        width: 365px;
                        padding-top: 13px;
                        color: #58ffbb;
                        background-color: #000000db;
                        font-size: 20px;
                        border-radius: 20px;
                        border-left: 10px solid #58ffbb;
                        border-right: 10px solid #58ffbb;
                        z-index: 999;
                    `
        );
        nextActionWindow.innerHTML = `
                        <span style="color: #fff;">${
                          content.nextAction
                        }: </span>
                        <span>${content[nextAction.name]}</span></br>
                        <span style="color: #fff;">${content.in}: </span>
                        <span>${formatTime(nextAction.time)}</span>`;
        document
          .getElementById("header_game")
          .insertBefore(
            nextActionWindow,
            document.getElementById("header_game").children[0]
          );
      }
      showNextActionWindow();

      let nextActionCounter;

      nextActionCounter = setInterval(function () {
        nextAction.time = nextAction.time - 1000;

        nextActionWindow.innerHTML = `
                        <span style="color: #fff;">${
                          content.nextAction
                        }: </span>
                        <span>${content[nextAction.name]}</span></br>
                        <span style="color: #fff;">${content.in}: </span>
                        <span>${formatTime(nextAction.time)}</span>`;

        if (nextAction.time <= 0) {
          if (nextAction.index === 4) {
            document
              .getElementById("submenu2")
              .getElementsByClassName("menuitem glow")[0]
              .click();
          } else {
            setTimeout(function () {
              document
                .getElementsByClassName("cooldown_bar_link")
                [nextAction.index].click();
            }, clickDelay);
          }
        }
      }, 1000);
    }
  }

  if (autoGoActive) {
    window.onload = autoGo();
  }
})();
