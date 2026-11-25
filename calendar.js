(() => {
  const $ = (id) => document.getElementById(id);
  $("recipient").textContent = CALENDAR_CONFIG.recipient;
  $("sender").textContent = CALENDAR_CONFIG.sender;
  $("who").options[0].textContent = CALENDAR_CONFIG.recipient;
  if (!window.supabase) {
    $("login-error").textContent =
      "Could not load the calendar connection. Check your internet connection and reload.";
    return;
  }
  const client = window.supabase.createClient(
    CALENDAR_CONFIG.url,
    CALENDAR_CONFIG.key,
  );
  const dialog = $("surprise"),
    content = $("dialog-content");
  let user = null,
    role = null,
    days = [],
    opens = [];
  let previewDate = "";
  const previewedDays = new Set();
  const previewPhotos = [];
  const spotifyPreviews = new Map();
  let spotifyApiPromise = null;
  let spotifyController = null;

  function loadSpotifyApi() {
    if (!spotifyApiPromise) {
      spotifyApiPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const timeout = setTimeout(() => reject(new Error("Spotify API timed out")), 8000);
        window.onSpotifyIframeApiReady = (api) => {
          clearTimeout(timeout);
          resolve(api);
        };
        script.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Spotify API unavailable"));
        };
        script.src = "https://open.spotify.com/embed/iframe-api/v1";
        document.head.append(script);
      }).catch((error) => {
        spotifyApiPromise = null;
        throw error;
      });
    }
    return spotifyApiPromise;
  }

  function makeMusicAnimation() {
    return $("music-notes");
  }

  function showSpotifyPlayer(slot, url, title, visual) {
    const fallback = () => {
      if (!slot.isConnected || !dialog.open) return;
      const player = node("iframe", "spotify-embed");
      player.src = url.replace("open.spotify.com/", "open.spotify.com/embed/");
      player.title = `Spotify player: ${title}`;
      player.loading = "lazy";
      player.setAttribute("allow", "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
      player.setAttribute("allowfullscreen", "");
      slot.replaceChildren(player);
    };
    loadSpotifyApi().then((api) => {
      if (!slot.isConnected || !dialog.open) return;
      const target = node("div");
      slot.replaceChildren(target);
      api.createController(target, { url, width: "100%", height: 152 }, (controller) => {
        if (!slot.isConnected || !dialog.open) {
          controller.destroy();
          return;
        }
        spotifyController = controller;
        controller.addListener("playback_started", () => visual.classList.add("is-playing"));
        controller.addListener("playback_update", (event) => {
          if (!event.data || typeof event.data.isPaused !== "boolean") return;
          // Buffering can briefly change at startup without the user pausing.
          if (event.data.isBuffering) return;
          visual.classList.toggle("is-playing", !event.data.isPaused);
        });
      });
    }).catch(fallback);
  }
  function spotifyItemUrl(link) {
    try {
      if (typeof link !== "string") return null;
      const uri = link.trim().match(/^spotify:(track|album|playlist|episode|show|artist):([a-zA-Z0-9]{22})$/i);
      if (uri) return `https://open.spotify.com/${uri[1].toLowerCase()}/${uri[2]}`;
      const url = new URL(link.trim());
      if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
      const match = url.pathname.match(
        /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show|artist)\/([a-zA-Z0-9]{22})\/?$/i,
      );
      return match ? `https://open.spotify.com/${match[1].toLowerCase()}/${match[2]}` : null;
    } catch {
      return null;
    }
  }
  function getSpotifyPreview(link) {
    let itemUrl = spotifyItemUrl(link);
    if (!itemUrl) {
      try {
        const shortLink = new URL(link.trim());
        if (shortLink.protocol === "https:" && shortLink.hostname === "spotify.link") {
          itemUrl = shortLink.href;
        }
      } catch {
        return Promise.resolve(null);
      }
    }
    if (!itemUrl) return Promise.resolve(null);
    if (!spotifyPreviews.has(itemUrl)) {
      const endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(itemUrl)}`;
      const request = fetch(endpoint)
        .then((response) => {
          if (!response.ok) throw new Error("Spotify preview unavailable");
          return response.json();
        })
        .catch(() => {
          spotifyPreviews.delete(itemUrl);
          return null;
        });
      spotifyPreviews.set(itemUrl, request);
    }
    return spotifyPreviews.get(itemUrl);
  }
  function clearPreviewPhotos() {
    for (const url of previewPhotos) URL.revokeObjectURL(url);
    previewPhotos.length = 0;
  }
  const londonDate = (date) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  };
  const icons = {
    image: "♡",
    video: "▶",
    song: "♫",
    gift: "🎁",
    voucher: "☕",
    poem: "✎",
    message: "✉",
  };
  const node = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  function showError(e) {
    $("app-notice").textContent =
      e?.message || "Something went wrong. Please try again.";
  }
  async function init(session) {
    $("login-error").textContent = "";
    if (!session) {
      user = null;
      role = null;
      previewDate = "";
      previewedDays.clear();
      clearPreviewPhotos();
      $("preview-date").value = "";
      $("login").hidden = false;
      $("app").hidden = true;
      return;
    }
    user = session.user;
    const result = await client.rpc("my_calendar_role");
    if (result.error || !result.data) {
      await client.auth.signOut();
      $("login-error").textContent =
        "This account is not yet authorised for the calendar. Check the setup instructions.";
      return;
    }
    role = result.data;
    $("login").hidden = true;
    $("app").hidden = false;
    $("preview-controls").hidden = role !== "organiser";
    $("view-label").textContent =
      role === "organiser" ? "ORGANISER VIEW" : "A LITTLE SOMETHING FOR YOU";
    await refresh();
  }
  async function refresh() {
    const [d, o] = await Promise.all([
      client.from("calendar_days").select("*").order("day"),
      client.from("calendar_opens").select("*"),
    ]);
    const err = d.error || o.error;
    if (err) {
      showError(err);
      return;
    }
    days = d.data;
    opens = o.data;
    render();
  }
  function render() {
    $("calendar").replaceChildren();
    $("app-notice").textContent = "";
    const waiting = role === "organiser" ? days.filter((entry) => {
      const available = previewDate
        ? londonDate(new Date(entry.unlock_at)) <= previewDate
        : new Date(entry.unlock_at) <= new Date();
      return available && !previewedDays.has(entry.day);
    }).length : 0;
    $("progress").textContent = role === "organiser"
      ? `${previewedDays.size} doors previewed · ${waiting} ready in preview`
      : `${opens.length} of 25 little surprises opened`;
    if (role === "organiser") {
      $("real-progress").textContent = `${CALENDAR_CONFIG.recipient} has opened ${opens.length} of 25 doors.`;
      $("preview-status").textContent = previewDate
        ? `Previewing ${new Date(`${previewDate}T12:00:00Z`).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" })}. Future doors are locked in this preview.`
        : "Using the real date. You can still preview any door; choose a pretend date to test locked doors.";
    }
    for (let day = 1; day <= 25; day++) {
      const entry = days.find((x) => x.day === day),
        available =
          !!entry &&
          (role === "partner" || (previewDate
            ? londonDate(new Date(entry.unlock_at)) <= previewDate
            : new Date(entry.unlock_at) <= new Date())),
        opened = !!entry && (role === "organiser"
          ? previewedDays.has(day) && (!previewDate || available)
          : opens.some((x) => x.day === day));
      const b = node("button", "door");
      b.type = "button";
      b.classList.add(
        ["gift-green", "gift-stripe", "gift-navy", "gift-blue", "gift-red"][
          (day - 1) % 5
        ],
      );
      if ([3, 8, 15, 22].includes(day)) b.classList.add("wide");
      if ([4, 11, 18].includes(day)) b.classList.add("tall");
      if ([7, 16, 25].includes(day)) b.classList.add("large");
      if (available && !opened) b.classList.add("available");
      if (opened) b.classList.add("opened");
      b.setAttribute(
        "aria-label",
        `December ${day}: ${opened ? "opened" : available ? "ready to open" : "not yet available"}`,
      );
      b.append(node("span", "number", String(day)));
      if (!opened) {
        b.append(node("span", "knob"));
        if (b.classList.contains("gift-green")) {
          const bow = node("span", "gift-bow");
          bow.setAttribute("aria-hidden", "true");
          bow.style.animationDelay = `${-((day * 1.3) % 7)}s`;
          bow.append(node("span", "gift-bow-knot"));
          b.append(bow);
        }
      } else {
        if (entry?.type === "song") {
          b.classList.add("song-tile");
          const card = node("span", "song-card");
          const cover = node("span", "song-cover", "♫");
          const details = node("span", "song-details");
          const title = node("span", "song-title", entry.title || "A song for you");
          details.append(node("span", "song-kicker", "A LITTLE LISTEN"), title,
            node("span", "song-source", entry.spotify_url ? "SPOTIFY · TAP TO PLAY" : "TAP TO LISTEN"));
          card.append(cover, details);
          b.append(card);
          if (entry.spotify_url) {
            getSpotifyPreview(entry.spotify_url).then((preview) => {
              if (!preview) return;
              if (preview.title) {
                title.textContent = preview.title;
                b.setAttribute("aria-label", `December ${day}: opened, ${preview.title}`);
              }
              try {
                const art = new URL(preview.thumbnail_url);
                const isSpotifyArtwork = art.hostname === "i.scdn.co"
                  || art.hostname === "mosaic.scdn.co"
                  || art.hostname.endsWith(".spotifycdn.com");
                if (art.protocol !== "https:" || !isSpotifyArtwork) return;
                const image = node("img", "song-artwork");
                image.alt = "";
                image.loading = "lazy";
                image.addEventListener("load", () => {
                  b.style.backgroundImage = `url(${JSON.stringify(art.href)})`;
                  b.classList.add("has-song-art");
                });
                image.addEventListener("error", () => image.remove());
                image.src = art.href;
                cover.append(image);
              } catch {
                // Keep the illustrated music note if Spotify has no artwork.
              }
            });
          }
        } else if (entry?.type === "video") {
          b.classList.add("video-tile");
          b.setAttribute("aria-label", `December ${day}: opened, ${entry.title || "video"}`);
          const thumbnail = node("video", "video-thumbnail");
          thumbnail.muted = true;
          thumbnail.playsInline = true;
          thumbnail.preload = "metadata";
          thumbnail.tabIndex = -1;
          thumbnail.setAttribute("aria-hidden", "true");
          thumbnail.addEventListener("loadedmetadata", () => {
            if (Number.isFinite(thumbnail.duration) && thumbnail.duration > 0) {
              try { thumbnail.currentTime = Math.min(1, thumbnail.duration / 2); } catch {}
            }
          });
          const showFrame = () => b.classList.add("has-video-frame");
          thumbnail.addEventListener("loadeddata", showFrame);
          thumbnail.addEventListener("seeked", showFrame);
          thumbnail.addEventListener("error", () => b.classList.remove("has-video-frame"));
          const caption = node("span", "video-caption");
          caption.append(node("span", "video-play-icon", "▶"), node("span", "video-title", entry.title || "A little video"));
          b.append(thumbnail, caption);
          if (entry.media_path) {
            signed(entry.media_path)
              .then((url) => { if (b.isConnected) thumbnail.src = url; })
              .catch(() => {});
          }
        } else {
          const label = node("span", "door-label");
          label.append(
            node("span", "icon", icons[entry?.type] || "♡"),
            node("span", "", entry?.title || "A little surprise"),
          );
          b.append(label);
        }
        if (entry?.type === "image" && entry.media_path) {
          signed(entry.media_path)
            .then((url) => {
              b.style.backgroundImage = `url(${JSON.stringify(url)})`;
              b.classList.add("has-image");
            })
            .catch(() => {});
        }
      }
      b.addEventListener("click", () => openDay(day, entry, available));
      $("calendar").append(b);
    }
  }
  async function signed(path) {
    const r = await client.storage
      .from("calendar-media")
      .createSignedUrl(path, 600);
    if (r.error) throw r.error;
    return r.data.signedUrl;
  }
  async function loadPhoto(path) {
    const url = await signed(path);
    const photo = new Image();
    await new Promise((resolve, reject) => {
      photo.onload = resolve;
      photo.onerror = reject;
      photo.src = url;
    });
    return photo;
  }
  async function openDay(day, entry, available) {
    content.replaceChildren();
    let videoToPlay = null;
    let songAudio = null;
    let spotifyPlayerSetup = null;
    if (!entry || (role === "organiser" && previewDate && !available)) {
      content.append(
        node("p", "modal-tag", `December ${day}`),
        node("h2", "modal-title", "Not quite yet…"),
        node(
          "p",
          "modal-message",
          `This surprise will be ready on ${day} December.`,
        ),
      );
      content.querySelector("h2").id = "dialog-title";
      dialog.showModal();
      return;
    }
    if (role === "organiser") {
      previewedDays.add(day);
      render();
    }
    if (role === "partner" && !opens.some((x) => x.day === day)) {
      const r = await client
        .from("calendar_opens")
        .insert({ day, opened_by: user.id });
      if (r.error) {
        showError(r.error);
        return;
      }
      await refresh();
    }
    content.append(
      node("p", "modal-tag", `December ${day}`),
      node("h2", "modal-title", entry.title),
    );
    content.querySelector("h2").id = "dialog-title";
    if (entry.media_path) {
      try {
        const url = await signed(entry.media_path);
        let media;
        if (entry.type === "video") {
          media = node("video", "modal-media");
          media.loop = true;
          media.playsInline = true;
          media.preload = "auto";
          videoToPlay = media;
          const effectId = day === 13 ? "fireworks" : day === 3 ? "water-ripples" : null;
          if (effectId) {
            media.addEventListener("playing", () => $(effectId).classList.add("is-playing"));
            for (const event of ["pause", "ended"]) {
              media.addEventListener(event, () => $(effectId).classList.remove("is-playing"));
            }
          }
        }
        else if (entry.type === "song" || entry.type === "message")
          media = node("audio", "modal-media");
        else media = node("img", "modal-media");
        if (entry.type === "song" && media.tagName === "AUDIO") songAudio = media;
        media.src = url;
        if (media.tagName === "IMG") media.alt = entry.title;
        else media.controls = true;
        content.append(media);
      } catch (e) {
        content.append(node("p", "notice", "The media could not be loaded."));
      }
    }
    content.append(node("p", "modal-message", entry.message));
    let musicAnimation = null;
    if ((entry.type === "song" && songAudio) || spotifyItemUrl(entry.spotify_url)) {
      musicAnimation = makeMusicAnimation();
      if (songAudio) {
        songAudio.addEventListener("playing", () => musicAnimation.classList.add("is-playing"));
        for (const event of ["pause", "ended"]) {
          songAudio.addEventListener(event, () => musicAnimation.classList.remove("is-playing"));
        }
      }
    }
    if (entry.spotify_url) {
      try {
        const u = new URL(spotifyItemUrl(entry.spotify_url) || entry.spotify_url);
        if (u.protocol === "https:") {
          const spotifyUrl = spotifyItemUrl(entry.spotify_url);
          if (spotifyUrl) {
            const slot = node("div", "spotify-player");
            content.append(slot);
            spotifyPlayerSetup = () => showSpotifyPlayer(slot, spotifyUrl, entry.title, musicAnimation);
          }
          const a = node("a", "modal-link", "Open in Spotify");
          a.href = u.href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          content.append(a);
        }
      } catch {}
    }
    const photoSection = node("section", "uploaded-photos");
    function addUploadedPhoto(photo) {
      if (!photoSection.querySelector("h3")) {
        photoSection.append(
          node("h3", "upload-heading", "Our photos"),
        );
      }
      photo.className = "modal-media";
      photo.alt = `Photo uploaded for day ${day}`;
      photoSection.append(photo);
    }
    if (day === 2) {
      content.append(photoSection);
      const result = await client
        .from("calendar_uploads")
        .select("*")
        .eq("day", day)
        .order("created_at", { ascending: false });
      if (result.error)
        content.append(
          node("p", "notice", "Could not load photos: " + result.error.message),
        );
      else if (result.data.length) {
        const photos = await Promise.all(
          result.data.map(async (upload) => {
            try {
              return await loadPhoto(upload.path);
            } catch {
              return null;
            }
          }),
        );
        const available = photos.filter(Boolean);
        for (const photo of available) addUploadedPhoto(photo);
      }
      if (role === "organiser") {
        for (const url of previewPhotos) {
          const photo = node("img");
          photo.src = url;
          addUploadedPhoto(photo);
        }
      }
    }
    if (day === 2) {
      const form = node("form", "file-field");
      form.append(
        node(
          "p",
          "modal-message",
          "When we have our hot chocolate together, let’s take a photo to remember it. We can upload it here afterwards.",
        ),
      );
      const input = node("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp,image/gif";
      input.hidden = true;
      const cameraInput = node("input");
      cameraInput.type = "file";
      cameraInput.accept = input.accept;
      cameraInput.setAttribute("capture", "environment");
      cameraInput.hidden = true;
      const choices = node("div", "photo-choices");
      const cameraButton = node("button", "camera-button", "Take a photo");
      cameraButton.type = "button";
      cameraButton.addEventListener("click", () => cameraInput.click());
      const chooseButton = node("button", "camera-button", "Choose a photo");
      chooseButton.type = "button";
      chooseButton.addEventListener("click", () => input.click());
      choices.append(cameraButton, chooseButton);
      const selectedPreview = node("img", "selected-photo");
      selectedPreview.alt = "Photo ready to save";
      selectedPreview.hidden = true;
      const button = node("button", "action", "Save photo");
      button.type = "submit";
      button.hidden = true;
      const msg = node("p", "notice");
      msg.setAttribute("role", "status");
      let selectedFile = null;
      let selectedUrl = null;
      function setSaving(saving) {
        button.disabled = saving;
        cameraButton.disabled = saving;
        chooseButton.disabled = saving;
      }
      function clearSelection() {
        if (selectedUrl) URL.revokeObjectURL(selectedUrl);
        selectedUrl = null;
        selectedFile = null;
        input.value = "";
        cameraInput.value = "";
        selectedPreview.removeAttribute("src");
        selectedPreview.hidden = true;
        button.hidden = true;
      }
      function selectPhoto(file) {
        if (!file) return;
        clearSelection();
        if (file.size > 10 * 1024 * 1024) {
          msg.textContent = "Please choose a photo smaller than 10 MB.";
          return;
        }
        if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
          msg.textContent = "Please use a JPG, PNG, WebP or GIF image.";
          return;
        }
        selectedFile = file;
        selectedUrl = URL.createObjectURL(file);
        selectedPreview.src = selectedUrl;
        selectedPreview.hidden = false;
        button.hidden = false;
        msg.textContent = "Your photo is ready to save.";
      }
      input.addEventListener("change", () => {
        selectPhoto(input.files[0]);
      });
      cameraInput.addEventListener("change", () => {
        selectPhoto(cameraInput.files[0]);
      });
      form.append(choices, input, cameraInput, selectedPreview, button, msg);
      dialog.addEventListener("close", clearSelection, { once: true });
      if (role === "organiser") {
        form.append(node("p", "notice", "Organiser preview: test photos stay on this device and are not saved to Christopher’s calendar."));
      }
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const file = selectedFile;
        if (!file) {
          msg.textContent = "Choose or take a photo first.";
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          msg.textContent = "Please choose a photo smaller than 10 MB.";
          return;
        }
        setSaving(true);
        msg.textContent = "Uploading…";
        const ext = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/gif": "gif",
        }[file.type];
        if (!ext) {
          msg.textContent = "Please use a JPG, PNG, WebP or GIF image.";
          setSaving(false);
          return;
        }
        if (role === "organiser") {
          const url = URL.createObjectURL(file);
          previewPhotos.push(url);
          const photo = node("img");
          photo.src = url;
          addUploadedPhoto(photo);
          msg.textContent = "Photo added to your preview only.";
          clearSelection();
          setSaving(false);
          return;
        }
        const path = `uploads/${user.id}/${day}/${crypto.randomUUID()}.${ext}`;
        const up = await client.storage
          .from("calendar-media")
          .upload(path, file, { contentType: file.type });
        if (up.error) {
          msg.textContent = up.error.message;
          setSaving(false);
          return;
        }
        const record = await client
          .from("calendar_uploads")
          .insert({ day, uploaded_by: user.id, path });
        if (record.error) {
          msg.textContent =
            "Photo uploaded, but it could not be recorded. Contact the organiser.";
          setSaving(false);
          return;
        }
        msg.textContent = "Photo uploaded!";
        clearSelection();
        setSaving(false);
        try {
          const photo = await loadPhoto(path);
          if (photoSection.isConnected) addUploadedPhoto(photo);
        } catch {
          msg.textContent = "Photo uploaded! Close and reopen the day to view it.";
        }
      });
      content.append(form);
    }
    dialog.showModal();
    if (spotifyPlayerSetup) spotifyPlayerSetup();
    if (videoToPlay) {
      try {
        await videoToPlay.play();
        if (!dialog.open || !content.contains(videoToPlay)) videoToPlay.pause();
      } catch (error) {
        if (!dialog.open || !content.contains(videoToPlay)) return;
        if (error.name === "NotAllowedError") {
          videoToPlay.muted = true;
          try {
            await videoToPlay.play();
            if (dialog.open && content.contains(videoToPlay)) {
              videoToPlay.after(node("p", "notice", "The video is muted for autoplay. Use the video controls to turn the sound on."));
            } else {
              videoToPlay.pause();
            }
          } catch {
            if (dialog.open && content.contains(videoToPlay)) {
              videoToPlay.after(node("p", "notice", "Tap play to start the video."));
            }
          }
        } else {
          videoToPlay.after(node("p", "notice", "The video could not play automatically. Try the video controls."));
        }
      }
    }
  }
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const selected = $("who").value;
    const email =
      selected === "partner"
        ? CALENDAR_CONFIG.partnerEmail
        : CALENDAR_CONFIG.organiserEmail;
    if (!email) {
      $("login-error").textContent =
        "Setup is not complete yet: add both account emails to config.js.";
      return;
    }
    const button = e.target.querySelector("button");
    button.disabled = true;
    $("login-error").textContent = "Signing in…";
    const result = await client.auth.signInWithPassword({
      email,
      password: $("password").value,
    });
    button.disabled = false;
    $("password").value = "";
    if (result.error) {
      $("login-error").textContent =
        "Could not sign in. Check your password and try again.";
      return;
    }
    await init(result.data.session);
  });
  $("logout").addEventListener("click", async () => {
    await client.auth.signOut();
    await init(null);
  });
  $("preview-date").addEventListener("change", (event) => {
    previewDate = event.target.value;
    render();
  });
  $("preview-real-date").addEventListener("click", () => {
    previewDate = "";
    $("preview-date").value = "";
    render();
  });
  $("preview-open-all").addEventListener("click", () => {
    if (role !== "organiser") return;
    const latestDate = days.reduce((latest, entry) => {
      previewedDays.add(entry.day);
      const unlockDate = londonDate(new Date(entry.unlock_at));
      return unlockDate > latest ? unlockDate : latest;
    }, "");
    if (latestDate && (!previewDate || previewDate < latestDate)) {
      previewDate = latestDate;
      $("preview-date").value = latestDate;
    }
    render();
  });
  $("preview-clear").addEventListener("click", () => {
    previewedDays.clear();
    clearPreviewPhotos();
    render();
  });
  document
    .querySelector(".close")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    $("music-notes").classList.remove("is-playing");
    $("fireworks").classList.remove("is-playing");
    $("water-ripples").classList.remove("is-playing");
    content.querySelectorAll("video,audio").forEach((m) => m.pause());
    if (spotifyController) {
      spotifyController.destroy();
      spotifyController = null;
    }
    content.querySelectorAll(".spotify-embed").forEach((player) => player.remove());
  });
  client.auth.getSession().then(({ data, error }) => {
    if (error) $("login-error").textContent = error.message;
    else init(data.session);
  });
})();
