// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Ascending set of bucket ids. Small by design (capped by the hook), so linear shifts are fine.
library SortedBuckets {
    function insert(uint32[] storage list, uint32 id) internal {
        uint256 n = list.length;
        uint256 lo;
        uint256 hi = n;
        while (lo < hi) {
            uint256 mid = (lo + hi) >> 1;
            if (list[mid] < id) lo = mid + 1;
            else hi = mid;
        }
        if (lo < n && list[lo] == id) return;

        list.push(id);
        for (uint256 i = n; i > lo; --i) {
            list[i] = list[i - 1];
        }
        list[lo] = id;
    }

    function remove(uint32[] storage list, uint32 id) internal {
        uint256 n = list.length;
        for (uint256 i; i < n; ++i) {
            if (list[i] == id) {
                for (uint256 j = i; j + 1 < n; ++j) {
                    list[j] = list[j + 1];
                }
                list.pop();
                return;
            }
        }
    }
}
