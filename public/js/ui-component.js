import { isValidUrl } from "./utils.js";

export const createNavigationUI = (
  currentChapter,
  prevChapter,
  nextChapterData
) => `
  <div class="flex flex-col items-center space-y-4 my-6 p-4 rounded-lg bg-gray-50 dark:bg-gray-800 transition-colors duration-200">
    <h3 class="text-xl font-semibold text-gray-800 dark:text-gray-200">
      ${currentChapter.title || "Current Chapter"}
    </h3>
    <div class="flex flex-wrap justify-center gap-4">
      ${prevChapter ? createPrevButton(prevChapter) : ""}
      ${nextChapterData ? createNextButton(nextChapterData) : ""}
    </div>
  </div>
`;

const createPrevButton = (prevChapter) => {
  console.log(isValidUrl(prevChapter?.url));
  if (isValidUrl(prevChapter?.url)) {
    return `
  <button 
    class="flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors" 
    data-url="${prevChapter.url}"
  >
    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
    </svg>
    ${prevChapter.title || "Trước"}
  </button>
`;
  }
  return "";
};

const createNextButton = (nextChapterData) => {
  if (isValidUrl(nextChapterData?.url)) {
    return `
  <button 
    class="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
    data-url="${nextChapterData.url}"
  >
    ${nextChapterData.title || "Tiếp"}
    <svg class="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
    </svg>
  </button>
`;
  }
  return "";
};

export const updateLoadingState = (submitButton, isLoading) => {
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? "Đang xử lý..." : "Chuyển đổi";
  submitButton.classList.toggle("opacity-75", isLoading);
};
