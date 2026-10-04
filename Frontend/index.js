// --- Constants ---
const API_BASE = "http://127.0.0.1:5001";
const GENERATE_AUDIO_GUIDE_API_URL = `${API_BASE}/generate-audio-guide`;

const VOICES = {
  English: { Male: "Matthew", Female: "Alicia" },
  Hindi: { Male: "Aman", Female: "Namrita" },
  Tamil: { Male: "Murali", Female: "Iniya" },
  Telugu: { Male: "Zion", Female: "Josie" }
};

const LOCALES = {
  English: "en-US",
  Hindi: "hi-IN",
  Tamil: "ta-IN",
  Telugu: "te-IN"
};

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'><rect width='100%25' height='100%25' fill='%23fff1e5'/></svg>";

// --- State ---
const state = {
  place: '',
  image: '',
  length: 'Summary',
  voice: 'Male'
};

// --- DOM Elements ---
const cardsContainer = document.querySelector('.cards');
const experiencePanel = document.getElementById('experience');
const previewTitle = document.getElementById('previewTitle');
const audioSection = document.getElementById('audioSection');
const audioPlayer = document.getElementById('audioPlayer');
const transcriptText = document.getElementById('scriptText');
const generateButton = document.getElementById('generateBtn');
const languageSelect = document.getElementById('selectLanguage');
const closeButton = document.getElementById('closeExperience');
const searchPreviewCard = document.getElementById('searchPreviewCard');
const searchPreviewImage = document.getElementById('searchPreviewImage');
const searchPreviewTitle = document.getElementById('searchPreviewTitle');
const transcriptToggle = document.getElementById('transcriptToggle');
const transcriptContent = document.getElementById('transcriptContent');
const transcriptArrow = document.getElementById('transcriptArrow');

const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchBtn');

const itineraryDestination = document.getElementById('itineraryDestination');
const itineraryDays = document.getElementById('itineraryDays');
const itineraryButton = document.getElementById('itineraryBtn');
const itineraryResult = document.getElementById('itineraryResult');

// --- Functions ---

function selectDestination(place, image, clickedCard = null) {
  state.place = place;
  state.image = image;

  // Update UI content
  previewTitle.textContent = place;
  cardsContainer.classList.add('faded');

  // Reset previous states
  document.querySelectorAll('.place-card').forEach(card => card.classList.remove('active'));
  searchPreviewCard.classList.add('hidden');

  // Handle Card Visibility
  if (clickedCard) {
    clickedCard.classList.add('active');
  } else {
    // Search / itinerary result: show the preview card
    searchPreviewImage.src = image || PLACEHOLDER_IMAGE;
    searchPreviewTitle.textContent = place;
    searchPreviewCard.classList.remove('hidden');
    searchPreviewCard.classList.add('active');
  }

  // Reset Audio Panel
  audioSection.classList.add('hidden');
  audioPlayer.pause();
  audioPlayer.removeAttribute('src');
  transcriptText.textContent = '';
  generateButton.textContent = 'Generate Audio Guide';
  generateButton.disabled = false;

  // Show Panel with animation
  experiencePanel.classList.remove('hidden');
  setTimeout(() => {
    experiencePanel.classList.add('visible');
  }, 10);
}

function deselectDestination() {
  experiencePanel.classList.remove('visible');

  // Wait for animation to finish before hiding
  setTimeout(() => {
    experiencePanel.classList.add('hidden');
    cardsContainer.classList.remove('faded');
    searchPreviewCard.classList.add('hidden');
    document.querySelectorAll('.place-card').forEach(card => card.classList.remove('active'));
  }, 300);
}

// Look up any place name (used by the search bar and by itinerary stops)
async function lookupPlace(query) {
  const res = await fetch(`${API_BASE}/search-place?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Search failed.');
  return data;
}

async function searchDestination() {
  const query = searchInput.value.trim();
  if (!query) {
    searchInput.focus();
    return;
  }

  const originalLabel = searchButton.textContent;
  searchButton.disabled = true;
  searchButton.textContent = 'Searching...';

  try {
    const place = await lookupPlace(query);
    selectDestination(place.name, place.image);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    alert(err.message || 'Search failed. Please try again.');
  } finally {
    searchButton.disabled = false;
    searchButton.textContent = originalLabel;
  }
}

// Open a stop from the itinerary as an audio guide
async function openItineraryStop(stopName, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Opening...';

  let image = PLACEHOLDER_IMAGE;
  try {
    const place = await lookupPlace(stopName);
    if (place.image) image = place.image;
  } catch (err) {
    console.warn('No photo found for', stopName);
  }

  selectDestination(stopName, image);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  button.disabled = false;
  button.textContent = originalText;
}

function renderItinerary(plan) {
  itineraryResult.innerHTML = '';

  const title = document.createElement('h3');
  title.className = "text-2xl font-['Playfair_Display',_serif] font-bold text-gray-900 mb-6";
  title.textContent = plan.title || 'Your itinerary';
  itineraryResult.appendChild(title);

  (plan.days || []).forEach(day => {
    const dayBox = document.createElement('div');
    dayBox.className = 'mb-6 p-5 rounded-2xl border border-gray-100 bg-gray-50';

    const heading = document.createElement('h4');
    heading.className = 'text-sm font-bold text-[#ff8a1f] mb-3';
    heading.textContent = `Day ${day.day}: ${day.theme || ''}`;
    dayBox.appendChild(heading);

    (day.stops || []).forEach(stop => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-4 py-3 border-t border-dashed border-gray-200 first:border-t-0';

      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'font-semibold text-gray-900 text-sm';
      name.textContent = stop.name;
      const tip = document.createElement('div');
      tip.className = 'text-xs text-gray-500 mt-0.5';
      tip.textContent = stop.tip || '';
      info.appendChild(name);
      info.appendChild(tip);

      const listenBtn = document.createElement('button');
      listenBtn.className = 'shrink-0 px-4 py-2 rounded-full bg-gray-900 text-white text-xs font-semibold hover:bg-[#ff8a1f] transition-colors disabled:opacity-60';
      listenBtn.textContent = 'Audio guide';
      listenBtn.addEventListener('click', () => openItineraryStop(stop.name, listenBtn));

      row.appendChild(info);
      row.appendChild(listenBtn);
      dayBox.appendChild(row);
    });

    itineraryResult.appendChild(dayBox);
  });

  itineraryResult.classList.remove('hidden');
}

async function generateItinerary() {
  const destination = itineraryDestination.value.trim();
  if (!destination) {
    itineraryDestination.focus();
    return;
  }

  itineraryButton.disabled = true;
  itineraryButton.textContent = 'Planning your trip...';
  itineraryResult.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/generate-itinerary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination,
        days: parseInt(itineraryDays.value, 10)
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not build the itinerary.');
    renderItinerary(data);
  } catch (err) {
    console.error(err);
    alert(err.message || 'Could not build the itinerary. Please try again.');
  } finally {
    itineraryButton.disabled = false;
    itineraryButton.textContent = 'Plan my trip';
  }
}

// --- Event Listeners ---

// Close Button
closeButton.addEventListener('click', deselectDestination);

// Card Clicks
document.querySelectorAll('.place-card:not(.search-preview-card)').forEach(card => {
  card.addEventListener('click', () => {
    selectDestination(card.dataset.place, card.dataset.image, card);
  });
});

// Search
searchButton.addEventListener('click', searchDestination);
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') searchDestination();
});

// Itinerary
itineraryButton.addEventListener('click', generateItinerary);
itineraryDestination.addEventListener('keydown', e => {
  if (e.key === 'Enter') generateItinerary();
});

// Option Toggles (History Type)
const lengthButtons = document.querySelectorAll('[data-group="length"] button');
lengthButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    lengthButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.length = btn.dataset.value;
  });
});

// Option Toggles (Voice Gender)
const voiceButtons = document.querySelectorAll('[data-group="voice"] button');
voiceButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    voiceButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.voice = btn.dataset.value;
  });
});

// Generate Audio guide button Logic
generateButton.addEventListener('click', async () => {
  generateButton.disabled = true;
  generateButton.textContent = '⏳ Generating Audio...';

  try {
    const selectedLanguage = languageSelect.value;
    const selectedVoice = state.voice;

    const response = await fetch(GENERATE_AUDIO_GUIDE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        place: state.place,
        answerType: state.length,
        language: selectedLanguage,
        voiceId: VOICES[selectedLanguage][selectedVoice],
        locale: LOCALES[selectedLanguage]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Generation failed');

    // Update UI with Result
    transcriptText.textContent = data.description;
    audioSection.classList.remove('hidden');

    if (data.audioBase64) {
      audioPlayer.src = `data:audio/mp3;base64,${data.audioBase64}`;
      audioPlayer.load();
      audioPlayer.classList.remove('hidden');
      audioPlayer.play().catch(() => { /* browser blocked autoplay - user can press play */ });
      generateButton.textContent = 'Regenerate with current settings';
    } else {
      audioPlayer.classList.add('hidden');
      generateButton.textContent = 'Audio Not Available';
    }
    // Re-enable so users can try another language / voice / length
    generateButton.disabled = false;

  } catch (err) {
    console.error(err);
    alert(err.message || 'Generation failed. Please check your connection.');
    generateButton.textContent = 'Generate Audio Guide';
    generateButton.disabled = false;
  }
});

// Transcript Toggle
transcriptToggle.addEventListener('click', () => {
  transcriptContent.classList.toggle('hidden');
  transcriptArrow.classList.toggle('rotate-180');
});