pub fn read_const_n_bytes_at<const N: usize>(bytes: &[u8], shift: usize) -> [u8; N] {
    bytes[shift..(shift + N)].try_into().unwrap()
}

pub fn next_const_n_bytes<const N: usize>(bytes: &[u8]) -> ([u8; N], &[u8]) {
    (bytes[0..N].try_into().unwrap(), &bytes[N..])
}

pub fn next_n_bytes(bytes: &[u8], n: usize) -> (&[u8], &[u8]) {
    (&bytes[0..n], &bytes[n..])
}
