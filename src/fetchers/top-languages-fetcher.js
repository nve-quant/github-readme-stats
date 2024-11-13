// @ts-check
import { retryer } from "../common/retryer.js";
import {
  CustomError,
  logger,
  MissingParamError,
  request,
  wrapTextMultiline,
} from "../common/utils.js";

/**
 * @typedef {import("axios").AxiosRequestHeaders} AxiosRequestHeaders Axios request headers.
 * @typedef {import("axios").AxiosResponse} AxiosResponse Axios response.
 */

/**
 * Top languages fetcher object.
 *
 * @param {AxiosRequestHeaders} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<AxiosResponse>} Languages fetcher response.
 */
const fetcher = (variables, token) => {
  return request(
    {
      query: `
      query userInfo($login: String!) {
        user(login: $login) {
          # fetch only owner repos & not forks
          repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
            nodes {
              name
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    color
                    name
                  }
                }
              }
            }
          }
        }
      }
      `,
      variables,
    },
    {
      Authorization: `token ${token}`,
    },
  );
};

/**
 * @typedef {import("./types").TopLangData} TopLangData Top languages data.
 */

/**
 * Fetch top languages for a given username.
 *
 * @param {string} username GitHub username.
 * @param {string[]} exclude_repo List of repositories to exclude.
 * @param {number} size_weight Weightage to be given to size.
 * @param {number} count_weight Weightage to be given to count.
 * @returns {Promise<TopLangData>} Top languages data.
 */
const fetchTopLanguages = async (
  username,
  exclude_repo = [],
  size_weight = 1,
  count_weight = 0,
) => {
  if (!username) {
    throw new MissingParamError(["username"]);
  }

  try {
    // Define custom language stats
    const customLanguages = {
      Python: {
        name: "Python",
        color: "#3572A5",
        size: 44.71,
        count: 15
      },
      TypeScript: {
        name: "TypeScript",
        color: "#2b7489",
        size: 15.08,
        count: 8
      },
      JavaScript: {
        name: "JavaScript",
        color: "#f1e05a",
        size: 13.64,
        count: 7
      },
      Rust: {
        name: "Rust",
        color: "#dea584",
        size: 9.28,
        count: 5
      },
      "C++": {
        name: "C++",
        color: "#f34b7d",
        size: 7.22,
        count: 4
      },
      Solidity: {
        name: "Solidity",
        color: "#AA6746",
        size: 4.88,
        count: 3
      },
      Go: {
        name: "Go",
        color: "#00ADD8",
        size: 3.21,
        count: 2
      },
      C: {
        name: "C",
        color: "#555555",
        size: 1.98,
        count: 2
      }
    };

    // Convert bytes to relative percentages
    const totalBytes = Object.values(customLanguages).reduce(
      (acc, curr) => acc + curr.size,
      0
    );

    Object.keys(customLanguages).forEach((key) => {
      customLanguages[key].size = (customLanguages[key].size / totalBytes) * 100;
    });

    // Sort languages by size
    const topLangs = Object.entries(customLanguages)
      .sort(([, a], [, b]) => b.size - a.size)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});

    return topLangs;

  } catch (error) {
    logger.error("Error in fetchTopLanguages:", error);
    throw error;
  }
};

export { fetchTopLanguages };
export default fetchTopLanguages;
